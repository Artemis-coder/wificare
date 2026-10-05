import { NotificationType, Priority, TicketStatus } from "@prisma/client";

import { prisma } from "./prisma";
import { notify } from "./notifications";
import { alertRegieWithoutTechnician, dispatchPendingTickets } from "./dispatch";
import { isSuperAdmin, type AppRole } from "./roles";

/**
 * Cycle de vie d'une demande d'intervention.
 *
 * Les règles vivent ici, et non dans les appelants : l'interface web crée et
 * affecte par des server actions (session NextAuth), l'application mobile par
 * l'API REST (jeton Bearer). Les deux chemins doivent appliquer exactement la
 * même répartition, sinon une demande créée depuis l'un des deux écrans
 * échapperait à l'affectation automatique.
 */

/** Résultat d'une opération : succès avec la donnée, ou refus motivé. */
export type TicketResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/** Refus motivé, à renvoyer tel quel par les appelants. */
export const fail = <T>(error: string, status: number): TicketResult<T> => ({
  ok: false,
  error,
  status,
});

const TICKET_INCLUDE = {
  client: true,
  wifiZone: true,
  technician: true,
} as const;

/** Auteur d'une opération sur une demande, avec les droits qui en découlent. */
export type TicketActor = { userId: string; role: AppRole };

export type CreateTicketInput = {
  wifiZoneId: string;
  type: string;
  priority?: unknown;
  description?: string | null;
  /** Renseigné uniquement pour une demande faite pour le compte d'un client. */
  clientId?: string;
};

/**
 * Crée une demande et la met en circulation.
 *
 * La demande n'est affectée à personne : elle est proposée à tous les
 * techniciens qui se sont déclarés en ligne, et le premier qui l'accepte la
 * prend. La demande est donc toujours créée à l'état `NEW`, et c'est
 * `lib/dispatch.ts` qui décide s'il y a quelqu'un à qui la proposer — ou si la
 * régie doit être prévenue qu'elle attend.
 */
export async function createTicket(
  input: CreateTicketInput
): Promise<TicketResult<TicketWithRelations>> {
  const zone = await prisma.wifiZone.findUnique({
    where: { id: input.wifiZoneId },
    include: { client: true },
  });

  if (!zone) {
    return fail("Wi-Fi Zone introuvable.", 404);
  }

  if (zone.status !== "ACTIVE") {
    return fail(
      "Cette Wi-Fi Zone n'est pas encore validée par la plateforme.",
      409
    );
  }

  const clientId = input.clientId ?? zone.clientId;

  const priority =
    typeof input.priority === "string" &&
    Object.values(Priority).includes(input.priority as Priority)
      ? (input.priority as Priority)
      : Priority.NORMAL;

  const count = await prisma.ticket.count();
  const reference = `#TK-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

  const ticket = await prisma.ticket.create({
    data: {
      reference,
      type: input.type,
      priority,
      status: TicketStatus.NEW,
      description: input.description || null,
      clientId,
      wifiZoneId: zone.id,
    },
    include: TICKET_INCLUDE,
  });

  // La répartition est déclenchée après l'écriture : elle ne propose que des
  // demandes déjà enregistrées, et une notification qui ouvrirait une demande
  // introuvable serait pire qu'une demande qui circule cinq secondes plus tard.
  const dispatch = await dispatchPendingTickets();

  if (dispatch.ticketsDispatched === 0) {
    await alertRegieWithoutTechnician({
      id: ticket.id,
      reference: ticket.reference,
      type: ticket.type,
      wifiZone: { name: zone.name },
      client: { name: ticket.client.name },
    });
  }

  return { ok: true, data: ticket };
}

/**
 * Charge une demande et vérifie que le compte a le droit d'y écrire.
 *
 * Une demande est l'intervention d'un technicien affecté : lui seul, et la
 * super administration par-dessus, peut la faire avancer. Un client suit sa
 * demande sans la faire avancer — sans ce contrôle, n'importe quel compte
 * authentifié, y compris un autre client, pourrait clore la demande d'autrui.
 *
 * La règle vit ici et non dans les routes : le statut et le rapport
 * d'intervention doivent accorder exactement les mêmes droits, sinon un
 *ritable par un chemin et pas par l'autre sur la même demande.
 */
export async function loadWritableTicket(
  auth: TicketActor,
  ticketId: string
): Promise<TicketResult<WritableTicket>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      reference: true,
      status: true,
      technicianId: true,
      client: { select: { userId: true } },
    },
  });

  if (!ticket) {
    return fail("Demande introuvable.", 404);
  }

  if (isSuperAdmin(auth.role)) {
    return {
      ok: true,
      data: { ...ticket, clientUserId: ticket.client.userId },
    };
  }

  if (auth.role === "CLIENT") {
    return fail(
      "Seul le technicien affecté peut faire avancer une demande.",
      403
    );
  }

  if (ticket.technicianId !== auth.userId) {
    return fail("Cette demande ne vous est pas affectée.", 403);
  }

  return {
    ok: true,
    data: { ...ticket, clientUserId: ticket.client.userId },
  };
}

type TicketWithRelations = {
  id: string;
  reference: string;
  type: string;
  status: string;
  technicianId: string | null;
  client: { name: string | null; userId: string | null };
  wifiZone: { name: string };
  technician: { name: string | null } | null;
};

/** Demande chargée par `loadWritableTicket`, avec son propriétaire résolu. */
export type WritableTicket = {
  id: string;
  reference: string;
  status: TicketStatus;
  technicianId: string | null;
  clientUserId: string | null;
};

/**
 * Charge une demande et vérifie que le compte a le droit de la **lire**.
 *
 * Une demande contient le contact du client, sa zone, le rapport du technicien,
 * son devis et son règlement : la lire, c'est déjà savoir beaucoup de choses sur
 * quelqu'un. Trois profils, trois périmètres : la super administration voit tout,
 * le technicien ses seules affectations, le propriétaire les demandes de son
 * propre dossier.
 *
 * `loadWritableTicket` est le cas particulier où le compte est en plus autorisé
 * à écrire. Les deux partagent la même chargement, pour qu'une demande visible
 * par un chemin le soit par tous.
 */
export async function loadReadableTicket(
  auth: TicketActor,
  ticketId: string
): Promise<TicketResult<WritableTicket>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      reference: true,
      status: true,
      technicianId: true,
      client: { select: { userId: true } },
    },
  });

  if (!ticket) {
    return fail("Demande introuvable.", 404);
  }

  if (isSuperAdmin(auth.role)) {
    return {
      ok: true,
      data: { ...ticket, clientUserId: ticket.client.userId },
    };
  }

  if (auth.role === "TECHNICIAN") {
    if (ticket.technicianId !== auth.userId) {
      return fail("Cette demande ne vous est pas affectée.", 403);
    }
  } else if (ticket.client.userId !== auth.userId) {
    return fail("Cette demande ne vous concerne pas.", 403);
  }

  return {
    ok: true,
    data: { ...ticket, clientUserId: ticket.client.userId },
  };
}

/**
 * Affecte un technicien choisi par la régie.
 *
 * Réservée au super administrateur : affecter quelqu'un qui n'a pas été choisi
 * par la répartition est une décision d'encadrement, pas une action de terrain.
 * Un technicien ne peut donc pas s'attribuer une demande, ni affecter un
 * collègue.
 *
 * Elle prime sur le circuit habituel : la demande cesse d'être proposée aux
 * techniciens en ligne, qui ne reçoivent plus rien la concernant. Les
 * propositions déjà parties sont retirées, faute de quoi un technicien
 * déciderait d'accepter une demande qui a déjà un technicien et se retrouverait
 * devant un refus au moment de partir.
 *
 * Réaffecter une demande déjà en cours est possible : le technicien précédent
 * est prévenu qu'elle lui est retirée, faute de quoi il se déplacerait pour une
 * intervention qui ne lui revient plus.
 */
export async function assignTicket(
  ticketId: string,
  technicianId: string
): Promise<TicketResult<TicketWithRelations>> {
  const technician = await prisma.user.findUnique({
    where: { id: technicianId },
    select: { id: true, name: true, role: true, status: true },
  });

  if (!technician || technician.role !== "TECHNICIAN") {
    return fail("Technicien introuvable.", 404);
  }

  if (technician.status !== "ACTIVE") {
    return fail(
      "Ce technicien n'est pas en service : réactivez son compte avant de lui affecter une demande.",
      400
    );
  }

  const existing = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { technicianId: true, clientId: true },
  });

  if (!existing) {
    return fail("Demande introuvable.", 404);
  }

  const previousTechnicianId = existing.technicianId;

  // La demande cesse de circuler : les propositions en attente sont retirées
  // pour que plus aucun technicien en ligne ne puisse la prendre. Elles sont
  // supprimées et non simplement closes, pour qu'une affectation ultérieure ne
  // soit pas bloquée par un historique de propositions sans objet.
  await prisma.taskOffer.deleteMany({
    where: { ticketId, status: "PENDING" },
  });

  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      technicianId,
      status: TicketStatus.ASSIGNED,
    },
    include: TICKET_INCLUDE,
  });

  // Le technicien découvre son intervention.
  await notify({
    userIds: [technicianId],
    type: NotificationType.TICKET_ASSIGNED,
    title: "Nouvelle intervention assignée",
    body: `${ticket.reference} · ${ticket.wifiZone.name} — ${ticket.type}.`,
    ticketId: ticket.id,
  });

  // Le client sait qui intervient.
  if (ticket.client.userId) {
    await notify({
      userIds: [ticket.client.userId],
      type: NotificationType.TICKET_ASSIGNED,
      title: "Technicien désigné",
      body: `${technician.name ?? "Un technicien"} prend en charge ${ticket.reference}.`,
      ticketId: ticket.id,
    });
  }

  if (previousTechnicianId && previousTechnicianId !== technicianId) {
    await notify({
      userIds: [previousTechnicianId],
      type: NotificationType.TICKET_ASSIGNED,
      title: "Intervention retirée",
      body: `${ticket.reference} a été confiée à un autre technicien.`,
      ticketId: ticket.id,
    });
  }

  return { ok: true, data: ticket };
}

/**
 * Statuts où le technicien peut encore rendre une demande.
 *
 * Tant qu'il n'est pas parti, la demande lui a été proposée et rien n'a encore
 * été fait sur place : la rendre ne gêne personne. Après, il y a un
 * déplacement, peut-être des pièces remplacées, et la demande est réellement en
 * cours — ce n'est plus un choix mais une annulation, et elle passe par le
 * statut `CANCELED` du technicien.
 */
const RELEASABLE_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.ASSIGNED,
  TicketStatus.CONFIRMED,
];

/**
 * Rend une demande au circuit de répartition.
 *
 * Le geste est celui du technicien : il a accepté, puis il ne peut plus y
 * aller — plus de temps, moyen de transport cassé, phishing à faire. La demande
 * repart alors en boucle chez les techniciens encore disponibles, au lieu d'être
 * annulée : le client a signalé une panne, elle n'est pas résolue.
 *
 * Sa proposition est supprimée et non marquée comme refusée : le technicien n'a
 * pas refusé le travail, il l'a rendu. C'est ce qui lui permet de se le voir
 * reproposé plus tard s'il se remet en ligne — ce qu'un refus rendrait
 * impossible.
 */
export async function releaseTicket(
  auth: TicketActor,
  ticketId: string
): Promise<TicketResult<TicketWithRelations>> {
  const writable = await loadWritableTicket(auth, ticketId);

  if (!writable.ok) {
    return fail(writable.error, writable.status);
  }

  if (!RELEASABLE_STATUSES.includes(writable.data.status)) {
    return fail(
      "Cette demande est déjà engagée : elle ne peut plus être remise en attente.",
      409
    );
  }

  await prisma.taskOffer.deleteMany({
    where: { ticketId, technicianId: auth.userId },
  });

  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      technicianId: null,
      status: TicketStatus.NEW,
      // La remise n'est pas un nouvel essai : repartir de zéro ferait dire à la
      // régie qu'une demande quatre fois proposée n'a été proposée qu'une fois.
      lastDispatchedAt: null,
    },
    include: TICKET_INCLUDE,
  });

  // Le client ne doit pas croire que quelqu'un s'est déplacé pour rien.
  if (ticket.client.userId) {
    await notify({
      userIds: [ticket.client.userId],
      type: NotificationType.TICKET_STATUS_CHANGED,
      title: "Technicien indisponible",
      body: `${ticket.reference} est à nouveau proposée aux techniciens disponibles.`,
      ticketId: ticket.id,
    });
  }

  await dispatchPendingTickets();

  return { ok: true, data: ticket };
}
