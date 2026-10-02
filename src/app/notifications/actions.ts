'use server';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Lecture et marquage des notifications depuis le back-office web.
 *
 * L'interface web s'authentifie par cookie de session NextAuth, pas par jeton
 * Bearer : elle passe donc par des server actions, à l'instar de la page
 * Utilisateurs. `GET /api/notifications` reste le chemin de l'application
 * mobile.
 */

export type WebNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  ticketId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationFeed = {
  items: WebNotification[];
  unreadCount: number;
};

/**
 * Notifications du compte connecté, et nombre de non-lus.
 *
 * Une notification est strictement personnelle : on ne lit que les siennes.
 * Le tri est antéchronologique, les plus récentes en tête.
 */
export async function fetchNotifications(limit = 20): Promise<NotificationFeed> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { items: [], unreadCount: 0 };
  }

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      ticketId: row.ticketId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    unreadCount,
  };
}

/** Marque une notification comme lue, et renvoie le nouveau compteur. */
export async function markNotificationRead(id: string): Promise<number> {
  const session = await getServerSession(authOptions);

  if (!session) return 0;

  // Le filtre sur `userId` est la règle : une notification appartient à son
  // destinataire, et personne ne doit pouvoir en marquer une autre que la sienne.
  await prisma.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { readAt: new Date() },
  });

  return prisma.notification.count({
    where: { userId: session.user.id, readAt: null },
  });
}

/** Vide le badge : toutes les notifications du compte passent en lues. */
export async function markAllNotificationsRead(): Promise<number> {
  const session = await getServerSession(authOptions);

  if (!session) return 0;

  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return 0;
}