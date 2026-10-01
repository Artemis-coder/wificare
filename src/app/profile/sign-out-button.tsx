'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';

/**
 * Déconnexion.
 *
 * Le back-office sert plusieurs rôles : sans sortie de session, passer d'un
 * compte à l'autre impose de vider le cache du navigateur à la main.
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
        void signOut({ callbackUrl: '/login' });
      }}
    >
      {loading ? 'Déconnexion...' : 'Se déconnecter'}
    </button>
  );
}
