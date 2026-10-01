import { NotificationType, Priority, TicketStatus } from "@prisma/client";

import { prisma } from "./prisma";
import { adminIds, notify, soleTechnicianId } from "./notifications";

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

const fail = <T>(error: string, status: number): TicketResult<T> => ({
  ok: false,
  error,
  status,
});

const TICKET_INCLUDE = {
  client: true,
  wifiZone: true,
  technician: true,
} as const;

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
 * Tant qu'un seul technicien est en service, la demande lui revient
 * automatiquement : personne d'autre ne pourrait la traiter. Dès qu'un second
 * technicien existe, la demande attend une décision de régie et les
 * administrateurs en sont prévenus.
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

  const clientId = input.clientId ?? zone.clientId;

  const priority =
    typeof input.priority === "string" &&
    Object.values(Priority).includes(input.priority as Priority)
      ? (input.priority as Priority)
      : Priority.NORMAL;

  const count = await prisma.ticket.count();
  const reference = `#TK-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

  const soleTechnician = await soleTechnicianId();

  const ticket = await prisma.ticket.create({
    data: {
      reference,
      type: input.type,
      priority,
      status: soleTechnician ? TicketStatus.ASSIGNED : TicketStatus.NEW,
      description: input.description || null,
      clientId,
      wifiZoneId: zone.id,
      technicianId: soleTechnician,
    },
    include: TICKET_INCLUDE,
  });

  await announceNewTicket(ticket, zone.name, zone.client.userId);

  return { ok: true, data: ticket };
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

/**
 * Prévient les bons destinataires d'une demande entrante.
 *
 * Avec un technicien unique, c'est lui qui est prévenu ainsi que le client.
 * Sinon la demande entre dans la file de répartition de la régie.
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
 * Réservée aux administrateurs et super administrateurs : affecter quelqu'un est
 * une décision d'encadrement, pas une action de terrain. Un technicien ne peut
 * donc pas s'attribuer une demande, ni affecter un collègue.
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
