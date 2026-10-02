'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

import type { AppRole } from '@/lib/roles';

/**
 * Rattachement des événements à une personne.
 *
 * Sans cet appel, tout ce que le back-office produit est rattaché à un
 * `distinct_id` anonyme : les événements, le replay de session et les exceptions
 * de deux régies se retrouveraient sur la même personne, et aucun rapport ne
 * pourrait dire quel compte a fait quoi.
 *
 * L'identifiant est celui de la base, pas le numéro de téléphone : le téléphone
 * est une donnée personnelle que PostHog n'a pas besoin de connaître, et il
 * change. Il part en propriété de personne, ce qui est le genre d'information
 * que l'on filtre dans PostHog sans la voir se répéter dans les propriétés de
 * chaque événement.
 *
 * Le composant ne rend rien et ne sert qu'à une chose : appeler `identify`
 * quand le compte est connu. Son absence sur l'écran de connexion est le
 * comportement normal, pas une panne.
 */
export function PostHogIdentity({
  userId,
  role,
  phone,
}: {
  userId: string;
  role: AppRole | undefined;
  phone: string | undefined;
}) {
  useEffect(() => {
    if (!posthog.__loaded) return;

    posthog.identify(userId, {
      role: role ?? undefined,
      phone: phone ?? undefined,
    });
  }, [userId, role, phone]);

  return null;
}