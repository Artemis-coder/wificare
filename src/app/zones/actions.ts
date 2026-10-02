'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { deleteZone, updateZone, type ZoneActor } from '@/lib/zones';

/**
 * Actions d'administration des Wi-Fi Zones.
 *
 * Chaque action relit la session et repasse par `lib/zones` : les règles de
 * propriété et de rôle sont vérifiées côté serveur, pas seulement en masquant
 * les boutons dans l'interface.
 */

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function currentActor(): Promise<ZoneActor | null> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return null;
  }

  return { userId: session.user.id, role: session.user.role };
}

function revalidateZoneViews() {
  revalidatePath('/zones');
  revalidatePath('/');
}

/** Valide une zone déclarée : elle entre dans le parc exploitable. */
export async function validateZoneAction(zoneId: string): Promise<ActionResult> {
  const actor = await currentActor();

  if (!actor) {
    return { ok: false, error: 'Non authentifié.' };
  }

  const result = await updateZone(actor, zoneId, { status: 'ACTIVE' });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidateZoneViews();

  return { ok: true };
}

/** Renvoie une zone en attente de validation. */
export async function rejectZoneAction(zoneId: string): Promise<ActionResult> {
  const actor = await currentActor();

  if (!actor) {
    return { ok: false, error: 'Non authentifié.' };
  }

  const result = await updateZone(actor, zoneId, { status: 'PENDING' });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidateZoneViews();

  return { ok: true };
}

/** Corrige le nom ou l'emplacement d'une zone. */
export async function editZoneAction(
  zoneId: string,
  patch: { name?: string; location?: string }
): Promise<ActionResult> {
  const actor = await currentActor();

  if (!actor) {
    return { ok: false, error: 'Non authentifié.' };
  }

  const result = await updateZone(actor, zoneId, patch);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidateZoneViews();

  return { ok: true };
}

/**
 * Supprime une zone.
 *
 * Le refus le plus fréquent est motivé par l'historique : `lib/zones` refuse une
 * zone qui porte des demandes, et ce refus est renvoyé tel quel plutôt que
 * transformé en échec technique.
 */
export async function deleteZoneAction(zoneId: string): Promise<ActionResult> {
  const actor = await currentActor();

  if (!actor) {
    return { ok: false, error: 'Non authentifié.' };
  }

  const result = await deleteZone(actor, zoneId);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidateZoneViews();

  return { ok: true };
}