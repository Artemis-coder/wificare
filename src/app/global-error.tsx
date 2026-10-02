'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

/**
 * Erreur de rendu à la racine du back-office.
 *
 * `global-error.tsx` remplace le `layout.tsx` complet lorsqu'une exception
 * remonte au-delà des frontières de segment. Sans ce rapport, l'exception qui
 * vient de remplacer toute l'interface est justement celle que PostHog ne
 * verrait jamais : c'est le moment où l'utilisateur regarde un écran cassé sans
 * que personne ne puisse dire ce qu'il faisait juste avant.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif',
          background: 'var(--bg-page, #f8fafc)',
          color: 'var(--text-primary, #0f172a)',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center', padding: '24px', maxWidth: '420px' }}>
          <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>
            Une erreur est survenue
          </h1>
          <p style={{ fontSize: '14px', marginBottom: '24px', color: 'var(--text-secondary, #475569)' }}>
            L&apos;écran n&apos;a pas pu s&apos;afficher. L&apos;erreur a été
            transmise et sera examinée.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-md, 8px)',
              border: 'none',
              background: 'var(--brand-600, #2563eb)',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}