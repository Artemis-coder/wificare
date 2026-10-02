'use client';

import posthog from 'posthog-js';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

/**
 * Déconnexion.
 *
 * Le back-office sert plusieurs rôles : sans sortie de session, passer d'un
 * compte à l'autre impose de vider le cache du navigateur à la main.
 *
 * `posthog.reset()` avant de partir n'est pas cosmétique. Sans lui, le
 * navigateur garde l'identité du compte qui vient de se déconnecter : la
 * personne suivante, sur le poste de régie, verrait ses actions rattachées au
 * compte précédent, et le premier écran de la nouvelle session porterait le
 * nom de l'ancien utilisateur.
 */
export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-secondary btn-md"
      disabled={loading}
      onClick={() => {
        setLoading(true);

        if (posthog.__loaded) {
          posthog.capture('signed_out');
          posthog.reset();
        }

        void signOut({ callbackUrl: '/login' });
      }}
    >
      {loading ? 'Déconnexion...' : 'Se déconnecter'}
    </button>
  );
}