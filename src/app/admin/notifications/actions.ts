'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import {
  AUDIENCE_HINT,
  AUDIENCE_LABEL,
  audienceUserIds,
  isBroadcastAudience,
  recentBroadcasts,
  sendBroadcast,
  type BroadcastAudience,
} from '@/lib/broadcast';
import { devicesSubscribedFor } from '@/lib/push';
import { isStaff } from '@/lib/roles';

/**
 * Actions de la console de notification, pour la régie.
 *
 * L'interface web s'authentifie par cookie de session NextAuth : elle passe
 * donc par des server actions. Le rôle est revérifié ici, et pas seulement dans
 * l'interface — l'interface ne protège pas la donnée, seule cette règle le
 * fait.
 */

export type AudienceOption = {
  value: BroadcastAudience;
  label: string;
  hint: string;
  /** Destinataires actifs : affiché avant l'envoi, pour viser juste. */
  count: number;
  /** Dont possédant un téléphone abonné au push, donc joignables hors application. */
  devices: number;
};

export type SentBroadcast = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  recipients: number;
};

/** Audiences et nombre de destinataires, pour composer sans deviner. */
export async function loadAudiences(): Promise<AudienceOption[]> {
  const audiences = Object.keys(AUDIENCE_LABEL) as BroadcastAudience[];

  return Promise.all(
    audiences.map(async (audience) => {
      const userIds = await audienceUserIds(audience);

      return {
        value: audience,
        label: AUDIENCE_LABEL[audience],
        hint: AUDIENCE_HINT[audience],
        count: userIds.length,
        // Un message envoyé à cent personnes n'avertit que celles qui ont un
        // téléphone abonné : l'écart se voit ici, et non dans l'usage.
        devices: await devicesSubscribedFor(userIds),
      };
    })
  );
}

export type BroadcastResult =
  | { ok: true; recipients: number }
  | { ok: false; error: string };

/** Envoie un message de la régie à une audience. */
export async function sendBroadcastAction(input: {
  audience: string;
  title: string;
  body: string;
}): Promise<BroadcastResult> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { ok: false, error: 'Non authentifié.' };
  }

  if (!isStaff(session.user.role)) {
    return { ok: false, error: 'Réservé à la régie.' };
  }

  if (!isBroadcastAudience(input.audience)) {
    return { ok: false, error: 'Audience inconnue.' };
  }

  const result = await sendBroadcast({
    audience: input.audience,
    title: input.title,
    body: input.body,
  });

  if (!result.ok) {
    return result;
  }

  revalidatePath('/admin/notifications');

  return result;
}

/** Dernières campagnes, pour garder une trace de ce qui a été dit. */
export async function fetchBroadcastHistory(): Promise<SentBroadcast[]> {
  const session = await getServerSession(authOptions);

  if (!session || !isStaff(session.user.role)) {
    return [];
  }

  const rows = await recentBroadcasts();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    recipients: row.recipients,
  }));
}