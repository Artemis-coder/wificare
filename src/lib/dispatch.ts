import {
  NotificationType,
  Priority,
  TaskOfferStatus,
  TicketStatus,
} from "@prisma/client";

import { adminIds, notify } from "./notifications";
import { prisma } from "./prisma";

/**
 * Répartition des demandes aux techniciens en ligne.
 *
 * La demande ne va pas à un technicien choisi d'avance : elle part à **tous**
 * ceux qui se sont déclarés disponibles, et le premier qui l'accepte la prend.
 * Ce module est le cœur de ce mécanisme, et il est volontairement sans état :
 * chaque passage recalcule l'ensemble à partir de la base, si bien que deux
 * passages simultanés — deux téléphones qui interrogent la file au même
 * instant — convergent vers le même résultat sans avoir à se coordonner.
 *
 * Ce qui déclenche un passage :
 *
 * - la création d'une demande (`lib/tickets.ts`), pour que la panne parte
 *   immédiatement ;
 * - la mise en ligne d'un technicien, qui veut du travail tout de suite et ne
 *   doit pas attendre qu'une autre demande tombe pour voir la file ;
 * - la lecture de la file par un technicien, toutes les cinq secondes depuis
 *   son application : c'est le tic de la boucle ;
 * - une réponse de technicien — acceptation, refus, remise — puisque c'est
 *   précisément ce qui doit relancer la circulation ;
 * - `POST /api/cron/dispatch`, filet de sécurité pour une plateforme dont tous
 *   les techniciens ont l'application fermée.
 *
 * Une boucle portée par le trafic des applications, pas une tâche automatique :
 * l'hébergement n'autorise qu'un déclenchement par jour, et même une tâche
 * toutes les cinq secondes serait une hypothèse sur une infrastructure que ce
 * dépôt ne possède pas. Les applications sont déjà là, et leur trafic ne coûte
 * rien.
 */

/**
 * Durée de validité d'une proposition.
 *
 * Assez long pour que le technicien ouvre l'application, lise la demande et
 * comprenne ce qu'on lui demande ; assez court pour qu'une demande ne reste
 * pas retenue par un téléphone laissé dans une poche. Passé ce délai, la
 * proposition est retirée et la demande repart chez quelqu'un d'autre : un
 * technicien en ligne dont le téléphone ne sonne pas ne doit pas immobiliser la
 * file.
 */
export const OFFER_TTL_MS = 90_000;

/**
 * Délai avant de reproposer une demande à un technicien qui ne l'a pas prise.
 *
 * Égal à la cadence de la boucle de répartition, et c'est le circuit qui doit
 * repartir tout seul : une proposition retirée parce qu'il s'est déconnecté, ou
 * expirée parce qu'il n'a pas répondu, revient au tour suivant. Cinq secondes
 * sont le pas de la boucle — un téléphone qui interroge le serveur toutes les
 * cinq secondes est déjà le rythme du circuit, et c'est lui qui décide de la
 * rotation.
 *
 * Un refus, lui, reste définitif : c'est une décision, pas un oubli.
 */
export const RE_OFFER_COOLDOWN_MS = 5_000;

/** Ordre de traitement des priorités, tel que le propriétaire les déclare. */
const PRIORITY_RANK: Record<Priority, number> = {
  [Priority.URGENT]: 0,
  [Priority.HIGH]: 1,
  [Priority.NORMAL]: 2,
  [Priority.LOW]: 3,
};

const PRIORITY_LABEL: Record<Priority, string> = {
  [Priority.URGENT]: "Urgente",
  [Priority.HIGH]: "Prioritaire",
  [Priority.NORMAL]: "Normale",
  [Priority.LOW]: "Faible",
};

/** Ce qu'un passage de répartition a produit. */
export type DispatchReport = {
  /** Demandes examinées : ni affectées, ni annulées, ni closes. */
  candidates: number;
  /** Techniciens en ligne au moment du passage. */
  onlineTechnicians: number;
  /** Propositions réellement créées, doublons concurrents exclus. */
  offersCreated: number;
  /** Demandes effectivement mises en circulation. */
  ticketsDispatched: number;
};

/** Demande candidate à la répartition, telle que la passe a besoin de la lire. */
type DispatchableTicket = {
  id: string;
  reference: string;
  type: string;
  priority: Priority;
  description: string | null;
  dispatchRound: number;
  createdAt: Date;
  client: { name: string | null; userId: string | null };
  wifiZone: { name: string; location: string | null };
};

type OnlineTechnician = { id: string; name: string | null };

/**
 * Fait circuler les demandes qui n'ont pas de technicien.
 *
 * Idempotent : appelé deux fois de suite sans changement entre les deux, le
 * second passage ne crée aucune proposition. C'est ce qui permet aux appelants
 * de ne pas se coordonner et de déclencher un passage liberally.
 *
 * Ne lève jamais : un échec de répartition ne doit jamais faire perdre la
 * demande au client, qui vient de la soumettre.
 */
export async function dispatchPendingTickets(): Promise<DispatchReport> {
  const now = new Date();
  const report: DispatchReport = {
    candidates: 0,
    onlineTechnicians: 0,
    offersCreated: 0,
    ticketsDispatched: 0,
  };

  try {
    await expireStaleOffers(now);

    const tickets = await prisma.ticket.findMany({
      where: { status: TicketStatus.NEW, technicianId: null },
      select: {
        id: true,
        reference: true,
        type: true,
        priority: true,
        description: true,
        dispatchRound: true,
        createdAt: true,
        client: { select: { name: true, userId: true } },
        wifiZone: { select: { name: true, location: true } },
      },
    });

    report.candidates = tickets.length;

    if (tickets.length === 0) {
      return report;
    }

    const technicians = await prisma.user.findMany({
      where: { role: "TECHNICIAN", status: "ACTIVE", isOnline: true },
      select: { id: true, name: true },
      // Le plus ancien en ligne est servi en premier. L'ordre n'a pas de
      // conséquence sur la répartition — tout le monde reçoit la même demande —
      // mais il rend les notifications d'un même passage prévisibles.
      orderBy: { onlineSince: { sort: "asc", nulls: "last" } },
    });

    report.onlineTechnicians = technicians.length;

    if (technicians.length === 0) {
      return report;
    }

    const known = await loadKnownOffers(tickets.map((ticket) => ticket.id), technicians);

    // La priorité prime sur l'ancienneté, parce que c'est ce que le propriétaire
    // a signalé : deux demandes simultanées dont l'une est urgente partent dans
    // cet ordre, et non dans celui d'arrivée au serveur. Le tri est fait ici
    // plutôt que dans la clause `orderBy` parce qu'une enum n'a pas d'ordre
    // garanti en base : un classement écrit dans le code survit à une
    // réécriture de la migration, un `orderBy` non.
    const ordered = [...tickets].sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );

    for (const ticket of ordered) {
      const recipients = technicians.filter((technician) =>
        isEligible(known.get(offerKey(ticket.id, technician.id)), now)
      );

      if (recipients.length === 0) {
        continue;
      }

      const offers = await createOffers(ticket, recipients, now);

      if (offers.length === 0) {
        continue;
      }

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { dispatchRound: { increment: 1 }, lastDispatchedAt: now },
      });

      report.ticketsDispatched += 1;
      report.offersCreated += offers.length;

      await announceOffers(ticket, offers);
    }
  } catch (error) {
    // Une répartition ratée se voit au prochain passage, cinq secondes plus
    // tard : la traiter comme un échec de la demande de répartition elle-même
    // ferait perdre au client une panne qu'il vient de signaler.
    console.error("Dispatch error:", error);
  }

  return report;
}

/**
 * Retire les propositions restées sans réponse.
 *
 * Le retrait n'intervient pas à la seconde près, mais au passage suivant, donc
 * dans les cinq secondes. Une expiration dépendant d'un déclencheur extérieur
 * pourrait avoir plusieurs minutes de retard, et une demande resterait retenue
 * par un technicien qui ne répond plus — le cas précis que ce mécanisme doit
 * couvrir.
 */
async function expireStaleOffers(now: Date): Promise<void> {
  await prisma.taskOffer.updateMany({
    where: {
      status: TaskOfferStatus.PENDING,
      offeredAt: { lt: new Date(now.getTime() - OFFER_TTL_MS) },
    },
    data: { status: TaskOfferStatus.EXPIRED, respondedAt: now },
  });
}

/** Identifiant d'une proposition, pour l'indexer sans recherche linéaire. */
function offerKey(ticketId: string, technicianId: string): string {
  return `${ticketId}:${technicianId}`;
}

type KnownOffer = {
  status: TaskOfferStatus;
  offeredAt: Date;
  respondedAt: Date | null;
};

/**
 * Propositions déjà connues pour ce couple demande / technicien.
 *
 * Chargées en une requête pour toutes les demandes et tous les techniciens du
 * passage : une requête par demande multiplierait le temps de réponse et la
 * charge de la base par le nombre de demandes en attente.
 */
async function loadKnownOffers(
  ticketIds: string[],
  technicians: OnlineTechnician[]
): Promise<Map<string, KnownOffer>> {
  const rows = await prisma.taskOffer.findMany({
    where: {
      ticketId: { in: ticketIds },
      technicianId: { in: technicians.map((technician) => technician.id) },
    },
    select: {
      ticketId: true,
      technicianId: true,
      status: true,
      offeredAt: true,
      respondedAt: true,
    },
  });

  return new Map(rows.map((row) => [offerKey(row.ticketId, row.technicianId), row]));
}

/**
 * Ce technicien peut-il se voir proposer cette demande ?
 *
 * Un refus est définitif : il vient d'une décision, pas d'un oubli, et le
 * reproposer serait renvoyer la même demande à celui qui vient de dire non. Une
 * acceptation signifie que la demande est à lui, et qu'elle ne circule plus.
 *
 * Les deux autres cas redeviennent éligibles au tour suivant de la boucle. Une
 * proposition retirée parce qu'il s'est déconnecté, ou expirée parce qu'il n'a
 * pas répondu, n'est pas un refus : la demande doit continuer de circuler, et
 * c'est le temps qui décide — si elle est encore là au passage suivant, elle
 * repart.
 */
function isEligible(offer: KnownOffer | undefined, now: Date): boolean {
  if (!offer) {
    return true;
  }

  if (
    offer.status === TaskOfferStatus.ACCEPTED ||
    offer.status === TaskOfferStatus.DECLINED
  ) {
    return false;
  }

  const lastTouchedAt = Math.max(
    offer.offeredAt.getTime(),
    offer.respondedAt?.getTime() ?? 0
  );

  return now.getTime() - lastTouchedAt >= RE_OFFER_COOLDOWN_MS;
}

/**
 * Crée les propositions et renvoie celles qui ont réellement été écrites.
 *
 * `skipDuplicates` sert de verrou : deux passages simultanés calculent les mêmes
 * destinataires, et celui qui arrive le second ne réécrit rien. Sans cette
 * option, la contrainte unique lèverait une erreur qui ferait échouer tout le
 * passage, y compris les propositions légitimes destinées aux autres demandes.
 */
async function createOffers(
  ticket: DispatchableTicket,
  recipients: OnlineTechnician[],
  now: Date
): Promise<{ id: string; technicianId: string }[]> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.taskOffer.createMany({
      data: recipients.map((technician) => ({
        ticketId: ticket.id,
        technicianId: technician.id,
        status: TaskOfferStatus.PENDING,
        offeredAt: now,
      })),
      skipDuplicates: true,
    });

    if (count === 0) {
      return [];
    }

    // `createMany` ne rend pas les lignes écrites : elles sont relues pour
    // pouvoir prévenir précisément ceux qui viennent d'être servis. Le filtre sur
    // l'horodatage isole ce passage du précédent.
    return tx.taskOffer.findMany({
      where: {
        ticketId: ticket.id,
        technicianId: { in: recipients.map((technician) => technician.id) },
        status: TaskOfferStatus.PENDING,
        offeredAt: { gte: now },
      },
      select: { id: true, technicianId: true },
    });
  });
}

/**
 * Prévient les techniciens servis, et le client que sa demande circule.
 *
 * La notification in-app et le push partent de la même écriture, comme le reste
 * de la plateforme : un technicien alerté par push retrouve la demande dans
 * l'application, et l'inverse vaut aussi.
 *
 * Le client n'est prévenu qu'à la **première** vague. Il ignore alors que sa
 * demande circule, ce qui vaut mieux qu'un statut figé « nouveau » : sa panne
 * n'attend plus une décision administrative, elle attend un technicien qui se
 * présente. Le prévenir à chaque passage le bombarderait d'un message identique
 * toutes les cinq secondes.
 */
async function announceOffers(
  ticket: DispatchableTicket,
  offers: { id: string; technicianId: string }[]
): Promise<void> {
  const urgent = ticket.priority === Priority.URGENT || ticket.priority === Priority.HIGH;

  for (const offer of offers) {
    await notify({
      userIds: [offer.technicianId],
      type: NotificationType.TASK_OFFER,
      title: urgent ? "Demande urgente disponible" : "Demande disponible",
      body: `${ticket.reference} · ${ticket.wifiZone.name} — ${ticket.type}. ${
        PRIORITY_LABEL[ticket.priority]
      }. Acceptez pour la prendre en charge.`,
      ticketId: ticket.id,
      // L'application ne peut pas ouvrir le détail d'une demande qui n'est pas
      // encore la sienne : elle ouvre la feuille de la proposition, et c'est
      // `offerId` qui la désigne.
      extraData: { type: "TASK_OFFER", offerId: offer.id },
    });
  }

  if (ticket.client.userId && ticket.dispatchRound === 0) {
    await notify({
      userIds: [ticket.client.userId],
      type: NotificationType.TICKET_STATUS_CHANGED,
      title: "Demande envoyée aux techniciens",
      body: `${ticket.reference} est proposée aux techniciens disponibles. Vous serez prévenu dès que l'un d'eux l'accepte.`,
      ticketId: ticket.id,
    });
  }
}

/**
 * Demandes en attente d'un technicien, pour la régie.
 *
 * Renvoyée avec son état de circulation, et non comme une simple liste : une
 * demande qui repasse depuis six heures ne dit pas la même chose qu'une demande
 * tombée à l'instant, et les deux s'afficheraient identiquement dans un tableau
 * de demandes. Le compte des refus est le chiffre qui décide — il distingue une
 * équipe qui ne veut pas ce travail d'une équipe qui n'est pas là.
 */
export type DispatchQueueRow = {
  id: string;
  reference: string;
  type: string;
  priority: Priority;
  createdAt: Date;
  dispatchRound: number;
  lastDispatchedAt: Date | null;
  zoneName: string;
  zoneLocation: string | null;
  clientName: string | null;
  /** Propositions en attente de réponse. */
  pending: number;
  /** Propositions retirées ou expirées : des techniciens ne répondent pas. */
  lapsed: number;
  /** Refus explicites. */
  declined: number;
};

export async function listDispatchQueue(): Promise<DispatchQueueRow[]> {
  const tickets = await prisma.ticket.findMany({
    where: { status: TicketStatus.NEW, technicianId: null },
    select: {
      id: true,
      reference: true,
      type: true,
      priority: true,
      createdAt: true,
      dispatchRound: true,
      lastDispatchedAt: true,
      wifiZone: { select: { name: true, location: true } },
      client: { select: { name: true } },
      taskOffers: { select: { status: true } },
    },
  });

  return tickets
    .map((ticket) => ({
      id: ticket.id,
      reference: ticket.reference,
      type: ticket.type,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      dispatchRound: ticket.dispatchRound,
      lastDispatchedAt: ticket.lastDispatchedAt,
      zoneName: ticket.wifiZone.name,
      zoneLocation: ticket.wifiZone.location,
      clientName: ticket.client.name,
      pending: ticket.taskOffers.filter((offer) => offer.status === "PENDING").length,
      lapsed: ticket.taskOffers.filter(
        (offer) =>
          offer.status === TaskOfferStatus.WITHDRAWN ||
          offer.status === TaskOfferStatus.EXPIRED
      ).length,
      declined: ticket.taskOffers.filter((offer) => offer.status === "DECLINED").length,
    }))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
}

/**
 * Prévenir la régie qu'une demande ne trouve personne.
 *
 * Réservé au moment où la demande tombe et où aucun technicien n'est en ligne :
 * c'est le seul cas où la décision est celle de la régie, puisqu'il n'y a
 * personne à qui proposer la demande. Une demande qui circule sans succès n'est
 * pas une alerte — elle est visible dans la file de répartition, et prévenir
 * toutes les cinq secondes ne rapporterait rien.
 */
export async function alertRegieWithoutTechnician(ticket: {
  id: string;
  reference: string;
  type: string;
  wifiZone: { name: string };
  client: { name: string | null };
}): Promise<void> {
  await notify({
    userIds: await adminIds(),
    type: NotificationType.TICKET_SUBMITTED,
    title: "Nouvelle demande, aucun technicien en ligne",
    body: `${ticket.reference} · ${
      ticket.client.name ?? "Client"
    } · ${ticket.wifiZone.name} — ${ticket.type}. Elle repartira automatiquement dès qu'un technicien se mettra en ligne.`,
    ticketId: ticket.id,
  });
}