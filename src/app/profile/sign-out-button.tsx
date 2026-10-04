'use client';

import { useState } from 'react';

import { signOutAndReset } from '@/lib/sign-out-client';

/**
 * Déconnexion.
 *
 * Le travail — déconnecter et rendre à PostHog l'anonymat — est dans
 * `lib/sign-out-client`, partagé avec le formulaire de mot de passe, qui
 * termine lui aussi par une déconnexion.
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

        void signOutAndReset();
      }}
    >
      {loading ? 'Déconnexion...' : 'Se déconnecter'}
    </button>
  );
}