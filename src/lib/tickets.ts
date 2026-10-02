import { NotificationType, Priority, TicketStatus } from "@prisma/client";

import { prisma } from "./prisma";
import { adminIds, leastLoadedTechnicianId, notify } from "./notifications";
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
 * Crée une demande et la répartit.
 *
 * L'affectation est automatique : la demande part vers le technicien le moins
 * chargé dès qu'un technicien est en service, sans attendre de décision de régie.
 * Une demande n'attend donc que lorsqu'aucun technicien n'est disponible, cas
 * auquel les administrateurs en sont prévenus pour en nommer un ou en créer un.
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

  const technicianId = await leastLoadedTechnicianId();

  const ticket = await prisma.ticket.create({
    data: {
      reference,
      type: input.type,
      priority,
      status: technicianId ? TicketStatus.ASSIGNED : TicketStatus.NEW,
      description: input.description || null,
      clientId,
      wifiZoneId: zone.id,
      technicianId,
    },
    include: TICKET_INCLUDE,
  });

  await announceNewTicket(ticket, zone.name, zone.client.userId);

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
 * Prévient les bons destinataires d'une demande entrante.
 *
 * L'affectation étant automatique, le technicien désigné est prévenu en même
 * temps que le client. Le cas sans technicien reste la seule situation où la
 * demande revient à la file de répartition.
 */
async function announceNewTicket(
  ticket: TicketWithRelations,
  zoneName: string,
  clientUserId: string | null
): Promise<void> {
  if (ticket.technicianId) {
    await notify({
      userIds: [ticket.technicianId],
      type: NotificationType.TICKET_ASSIGNED,
      title: "Nouvelle intervention assignée",
      body: `${ticket.reference} · ${zoneName} — ${ticket.type}. Elle vous a été attribuée automatiquement.`,
      ticketId: ticket.id,
    });

    if (clientUserId) {
      await notify({
        userIds: [clientUserId],
        type: NotificationType.TICKET_ASSIGNED,
        title: "Demande transmise au technicien",
        body: `${ticket.reference} a été transmise à ${ticket.technician?.name ?? "un technicien"}.`,
        ticketId: ticket.id,
      });
    }

    return;
  }

  await notify({
    userIds: await adminIds(),
    type: NotificationType.TICKET_SUBMITTED,
    title: "Nouvelle demande à répartir",
    body: `${ticket.reference} · ${ticket.client.name} · ${zoneName} — ${ticket.type}.`,
    ticketId: ticket.id,
  });
}

/**
 * Affecte un technicien choisi par la régie.
 *
 * Réservée au super administrateur : affecter quelqu'un qui n'a pas été choisi
 * automatiquement est une décision d'encadrement, pas une action de terrain. Un
 * technicien ne peut donc pas s'attribuer une demande, ni affecter un collègue.
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
