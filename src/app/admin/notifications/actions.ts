'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import {
  AUDIENCE_HINT,
  AUDIENCE_LABEL,
  audienceUserIds,
  broadcastStats,
  cancelBroadcast,
  isBroadcastAudience,
  recentBroadcasts,
  scheduleBroadcast,
  scheduledBroadcasts,
  sendBroadcastNow,
  sendBroadcastNowById,
  type BroadcastAudience,
  type BroadcastRow,
  type BroadcastStats,
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

/**
 * Ce que devient la demande.
 *
 * `SENT` et `SCHEDULED` sont distingués plutôt que confondus : l'écran n'a pas à
 * deviner si les chiffres qu'il affiche ont été mesurés ou s'ils n'existent pas
 * encore.
 */
export type BroadcastOutcome =
  | { ok: true; kind: 'SENT'; recipients: number; devices: number }
  | { ok: true; kind: 'SCHEDULED' }
  | { ok: false; error: string };

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Compte de la régie, ou refus.
 *
 * Chaque action repart de la session : l'interface protège l'écran, pas l'action,
 * et une action de server action peut être appelée directement.
 */
async function requireStaff(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { ok: false, error: 'Non authentifié.' };
  }

  if (!isStaff(session.user.role)) {
    return { ok: false, error: 'Réservé à la régie.' };
  }

  return { ok: true, userId: session.user.id };
}

function revalidate() {
  revalidatePath('/admin/notifications');
}

/** Programme un message, ou l'envoie tout de suite si aucune heure n'est donnée. */
export async function sendBroadcastAction(input: {
  audience: string;
  title: string;
  body: string;
  /** ISO 8601 UTC. Absent ou vide = envoi immédiat. */
  scheduledFor?: string;
}): Promise<BroadcastOutcome> {
  const staff = await requireStaff();

  if (!staff.ok) return staff;

  if (!isBroadcastAudience(input.audience)) {
    return { ok: false, error: 'Audience inconnue.' };
  }

  const message = {
    audience: input.audience,
    title: input.title,
    body: input.body,
  };

  // L'heure est déjà en UTC, venue du composeur. Son absence est ce qui
  // distingue un envoi d'une programmation, donc elle est testée ici et non
  // déduite d'un booléen calculé plus haut.
  if (!input.scheduledFor) {
    const result = await sendBroadcastNow(message, staff.userId);

    if (!result.ok) {
      return result;
    }

    revalidate();

    return { ok: true, kind: 'SENT', recipients: result.recipients, devices: result.devices };
  }

  const result = await scheduleBroadcast(
    { ...message, scheduledFor: new Date(input.scheduledFor) },
    staff.userId
  );

  if (!result.ok) {
    return result;
  }

  revalidate();

  return { ok: true, kind: 'SCHEDULED' };
}

/** Annule une campagne programmée avant son heure. */
export async function cancelBroadcastAction(input: {
  id: string;
}): Promise<ActionResult> {
  const staff = await requireStaff();

  if (!staff.ok) return staff;

  const result = await cancelBroadcast(input.id);

  if (result.ok) {
    revalidate();
  }

  return result;
}

/** Envoie sans attendre une campagne programmée. */
export async function sendScheduledBroadcastAction(input: {
  id: string;
}): Promise<BroadcastOutcome> {
  const staff = await requireStaff();

  if (!staff.ok) return { ok: false, error: staff.error };

  const result = await sendBroadcastNowById(input.id);

  if (!result.ok) {
    return result;
  }

  revalidate();

  return { ok: true, kind: 'SENT', recipients: result.recipients, devices: result.devices };
}

/** Campagnes en attente, pour la liste « programmées ». */
export async function fetchScheduledBroadcasts(): Promise<BroadcastRow[]> {
  const staff = await requireStaff();

  if (!staff.ok) return [];

  return scheduledBroadcasts();
}

/** Dernières campagnes, pour garder une trace de ce qui a été dit. */
export async function fetchBroadcastHistory(): Promise<BroadcastRow[]> {
  const staff = await requireStaff();

  if (!staff.ok) return [];

  return recentBroadcasts();
}

/** Chiffres affichés en tête de la console. */
export async function fetchBroadcastStats(): Promise<BroadcastStats | null> {
  const staff = await requireStaff();

  if (!staff.ok) return null;

  return broadcastStats();
}