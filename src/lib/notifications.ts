import { NotificationType, TicketStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { STAFF_ROLES } from "./roles";
import { notifyPush } from "./push";
import { notifyWebPush } from "./web-push";

/**
 * Écriture des notifications in-app et push.
 *
 * Le backend est la seule source de vérité : les canaux partent de la même
 * écriture, ce qui garantit qu'un utilisateur alerté retrouve la notification
 * dans l'application. Les notifications sont donc persistées, ce qui les rend
 * disponibles hors ligne et après redémarrage.
 *
 * Trois canaux, un par matériel : la notification in-app, le push Firebase pour
 * l'application Android (`lib/push`), et le push Web Push pour les navigateurs
 * du back-office (`lib/web-push`). Les deux derniers sont déclenchés ensemble
 * après l'écriture : un même événement alarme donc les deux matérials d'un coup.
 */

/** Destinataires d'une notification, à déduire du contexte métier. */
type NotificationInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  ticketId?: string;
};

/**
 * Crée une notification pour chaque destinataire, puis l'envoie en push.
 *
 * Ne fait jamais échouer l'opération métier qui l'appelle : une notification
 * perdue ne doit pas faire perdre une demande au client. Les erreurs sont
 * loguées, pas propagées. Le push est déclenché après l'écriture in-app, pour
 * qu'un échec de Firebase ne retarde jamais la réponse au client.
 */
export async function notify(input: NotificationInput): Promise<void> {
  const targets = [...new Set(input.userIds)].filter(Boolean);

  if (targets.length === 0) {
    return;
  }

  try {
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        ticketId: input.ticketId ?? null,
      })),
    });

    await notifyPush(targets, {
      title: input.title,
      body: input.body,
      ticketId: input.ticketId,
    });

    await notifyWebPush(targets, {
      title: input.title,
      body: input.body,
      ticketId: input.ticketId,
    });
  } catch (error) {
    console.error("Notification creation error:", error);
  }
}

/**
 * Identifiants des administrateurs : ce sont eux qui répartissent le travail.
 * La régie n'a plus qu'un profil, le super administrateur.
 */
export async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: { id: true },
  });

  return admins.map((admin) => admin.id);
}

/**
 * Statuts qui comptent comme une demande encore en cours de traitement.
 *
 * Une intervention close, annulée ou terminée ne pèse plus dans la charge d'un
 * technicien : le compter reviendrait à envoyer la prochaine demande au
 * technicien qui a, il y a six mois, traité le plus d'interventions.
 */
const OPEN_TICKET_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.TO_VERIFY,
  TicketStatus.ASSIGNED,
  TicketStatus.CONFIRMED,
  TicketStatus.EN_ROUTE,
  TicketStatus.DIAGNOSING,
  TicketStatus.PENDING_QUOTE,
  TicketStatus.REPAIRING,
  TicketStatus.COMPLETED,
  TicketStatus.PENDING_PAYMENT,
];

/**
 * Renvoie le technicien auquel une nouvelle demande revient automatiquement.
 *
 * L'affectation n'est plus une décision de régie : dès qu'un technicien est en
 * service, la demande lui est adressée sans intervention humaine. Le choix se
 * fait sur la charge réelle — le nombre de demandes en cours — afin que deux
 * techniciens ne s'accumulent pas sur le même backlog pendant que l'autre reste
 * libre. À charge égale, le plus ancien compte est servi le premier : c'est ce
 * qui fait tourner les demandes dans un ordre stable et prévisible plutôt qu'à
 * l'arrivée de la première requête.
 *
 * Renvoie `null` si aucun technicien n'est en service : la demande attend alors
 * dans la file de répartition du super administrateur.
 */
export async function leastLoadedTechnicianId(): Promise<string | null> {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN", status: "ACTIVE" },
    select: {
      id: true,
      createdAt: true,
      _count: {
        select: {
          tickets: { where: { status: { in: OPEN_TICKET_STATUSES } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (technicians.length === 0) {
    return null;
  }

  return technicians.reduce((least, technician) =>
    technician._count.tickets < least._count.tickets ? technician : least
  ).id;
}