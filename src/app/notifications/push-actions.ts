'use server';

import { NotificationType } from '@prisma/client';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { isStaff } from '@/lib/roles';

/**
 * Abonnements push des navigateurs du back-office.
 *
 * Server actions, et non l'API REST : l'interface web s'authentifie par cookie
 * de session NextAuth, pas par jeton Bearer. `POST /api/push-tokens` reste le
 * chemin de l'application mobile.
 *
 * Réservé à la régie : le back-office est son espace, un client n'a pas de
 * navigateur à abonner. Le rôle est revérifié ici, et pas seulement dans
 * l'interface — l'interface ne protège pas la donnée, seule cette règle le
 * fait.
 */

export type PushRegistration = {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
};

/** Enregistre, ou met à jour, l'abonnement du navigateur appelant. */
export async function registerWebPushAction(
  registration: PushRegistration
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { ok: false, error: 'Non authentifié.' };
  }

  if (!isStaff(session.user.role)) {
    return { ok: false, error: 'Réservé à la régie.' };
  }

  const endpoint = registration.endpoint?.trim();
  const p256dh = registration.p256dh?.trim();
  const auth = registration.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: 'Abonnement incomplet.' };
  }

  // `endpoint` est unique : se réabonner après avoir révoqué son autorisation
  // renewing remplace l'ancien abonnement au lieu d'en créer un second.
  await prisma.webPushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh,
      auth,
      userId: session.user.id,
      label: registration.label?.trim() || null,
    },
    update: {
      p256dh,
      auth,
      userId: session.user.id,
      label: registration.label?.trim() || null,
      lastSeenAt: new Date(),
    },
  });

  return { ok: true };
}

/** Retire l'abonnement du navigateur appelant. */
export async function unregisterWebPushAction(endpoint: string): Promise<{ ok: boolean }> {
  const session = await getServerSession(authOptions);

  if (!session) return { ok: false };

  // Le filtre sur `userId` est la règle : un abonnement appartient à son
  // titulaire, et personne ne doit pouvoir en retirer celui d'un autre compte.
  await prisma.webPushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });

  return { ok: true };
}

/** Abonnements du compte connecté, pour l'écran de réglages. */
export async function fetchWebPushSubscriptions(): Promise<
  { endpoint: string; label: string | null; lastSeenAt: string }[]
> {
  const session = await getServerSession(authOptions);

  if (!session) return [];

  const rows = await prisma.webPushSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { lastSeenAt: 'desc' },
    select: { endpoint: true, label: true, lastSeenAt: true },
  });

  return rows.map((row) => ({
    endpoint: row.endpoint,
    label: row.label,
    lastSeenAt: row.lastSeenAt.toISOString(),
  }));
}

/**
 * Notification d'essai, envoyée au compte connecté.
 *
 * Passe par `notify`, et non par un envoi direct : le test doit emprunter
 * exactement le chemin d'une vraie notification, sinon il validerait un canal
 * que la plateforme n'utilise pas.
 */
export async function sendTestNotificationAction(): Promise<void> {
  const session = await getServerSession(authOptions);

  if (!session || !isStaff(session.user.role)) {
    return;
  }

  await notify({
    userIds: [session.user.id],
    type: NotificationType.TICKET_SUBMITTED,
    title: "Notification d'essai",
    body: 'Si vous lisez ceci sur ce poste, les notifications hors application fonctionnent.',
  });
}