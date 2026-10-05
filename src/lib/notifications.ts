import { NotificationType } from "@prisma/client";
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
  /**
   * Clés additionnelles pour le push.
   *
   * `ticketId` ne suffit pas à tout : une demande proposée à un technicien n'est
   * pas encore la sienne, et ouvrir son détail lui renverrait un refus — l'API
   * ne laisse pas lire une demande qui n'est pas affectée. Il lui faut
   * l'identifiant de la proposition, transmis ici.
   */
  extraData?: Record<string, string>;
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
      extraData: input.extraData,
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
 *
 * Elle n'est plus appelée à la création d'une demande dès qu'un technicien est
 * disponible : la demande part alors à tous les techniciens en ligne
 * (`lib/dispatch.ts`). Elle ne reste le destinataire que lorsqu'aucun n'est
 * en ligne, et il n'y a alors personne d'autre à qui la demander.
 */
export async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: { id: true },
  });

  return admins.map((admin) => admin.id);
}

/**
 * Techniciens en ligne : ceux qui se sont déclarés disponibles.
 *
 * La liste est triée du plus ancien en ligne au plus récent. L'ordre ne change
 * rien à la répartition — la demande part à tout le monde — mais il rend
 * l'ordre d'apparition des notifications prévisible d'un passage à l'autre.
 *
 * Le compte est filtré sur son statut : un technicien hors service qui garde
 * l'application ouverte ne doit pas recevoir de demande, et son intention
 * déclarée ne remplace pas une décision de la régie.
 */
export async function onlineTechnicianIds(): Promise<string[]> {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN", status: "ACTIVE", isOnline: true },
    select: { id: true },
    orderBy: { onlineSince: { sort: "asc", nulls: "last" } },
  });

  return technicians.map((technician) => technician.id);
}