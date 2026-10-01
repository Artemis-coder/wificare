import { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Écriture des notifications in-app.
 *
 * Le backend est la seule source de vérité : l'application mobile les relit
 * (polling) au lieu de recevoir un push. Les notifications sont donc
 * persistées, ce qui les rend disponibles hors ligne et après redémarrage.
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
 * Crée une notification pour chaque destinataire.
 *
 * Ne fait jamais échouer l'opération métier qui l'appelle : une notification
 * perdue ne doit pas faire perdre une demande au client. Les erreurs sont
 * loguées, pas propagées.
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
  } catch (error) {
    console.error("Notification creation error:", error);
  }
}

/** Identifiants des administrateurs : ce sont eux qui répartissent le travail. */
export async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  return admins.map((admin) => admin.id);
}

/**
 * Renvoie l'unique technicien disponible, ou null.
 *
 * Tant que la plateforme ne compte qu'un technicien, toute demande entrante
 * lui revient automatiquement : il n'y a personne d'autre pour la traiter, et
 * une file d'attente n'aurait personne pour la vider. Dès qu'un second
 * technicien est en service, l'affectation redevient une décision de régie.
 */
export async function soleTechnicianId(): Promise<string | null> {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN", status: "ACTIVE" },
    select: { id: true },
    take: 2,
  });

  return technicians.length === 1 ? technicians[0].id : null;
}