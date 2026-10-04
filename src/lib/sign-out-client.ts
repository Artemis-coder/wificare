'use client';

import posthog from 'posthog-js';
import { signOut } from 'next-auth/react';

/**
 * Déconnexion, identité analytique comprise.
 *
 * Le back-office sert plusieurs rôles : sans sortie de session, passer d'un
 * compte à l'autre impose de vider le cache du navigateur à la main.
 *
 * `posthog.reset()` avant de partir n'est pas cosmétique. Sans lui, le
 * navigateur garde l'identité du compte qui vient de se déconnecter : la
 * personne suivante, sur le poste de régie, verrait ses actions rattachées au
 * compte précédent, et le premier écran de la nouvelle session porterait le nom
 * de l'ancien utilisateur.
 *
 * Partagé entre le bouton de déconnexion et le formulaire de mot de passe, qui
 * termine lui aussi par une déconnexion : deux copies de cette séquence
 * divergeraient, et celle qu'on oublierait de mettre à jour est précisément celle
 * qu'on ne relit pas.
 */
export function signOutAndReset(callbackUrl = '/login'): Promise<void> {
  if (posthog.__loaded) {
    posthog.capture('signed_out');
    posthog.reset();
  }

  return signOut({ callbackUrl });
}