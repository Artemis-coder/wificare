'use client';

import { useState, useTransition } from 'react';

import { sendTestNotificationAction } from './push-actions';
import { disableWebPush, enableWebPush, usePushState } from './push-client';

type Subscription = {
  id: string;
  label: string | null;
  lastSeenAt: string;
};

/**
 * Réglages de notification du poste.
 *
 * L'activation demande une permission au navigateur : elle ne peut donc pas
 * être déclenchée automatiquement, d'abord parce que le navigateur l'exige,
 * ensuite parce qu'une demande de permission sans explication se refuse par
 * réflexe.
 */
export default function PushSettings({
  vapidConfigured,
  subscriptions,
  testSent,
}: {
  /** Les clés VAPID sont-elles présentes côté serveur ? */
  vapidConfigured: boolean;
  subscriptions: Subscription[];
  testSent: boolean;
}) {
  const state = usePushState();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleEnable() {
    setError(null);
    setDone(false);

    startTransition(async () => {
      const result = await enableWebPush();

      if (!result.ok) {
        setError(result.error ?? 'Activation impossible.');
        return;
      }

      setDone(true);
      window.location.reload();
    });
  }

  function handleDisable() {
    setError(null);
    setDone(false);

    startTransition(async () => {
      await disableWebPush();
      window.location.reload();
    });
  }

  function handleTest() {
    setError(null);

    startTransition(async () => {
      await sendTestNotificationAction();
      setDone(true);
    });
  }

  return (
    <>
      <div className="data-table-wrapper" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 8px' }}>Notifications sur ce poste</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Une demande qui attend une répartition, un changement de statut, un
            devis envoyé : ce poste est prévenu même si le back-office est
            fermé.
          </p>

          {!vapidConfigured && (
            <p role="alert" style={{ color: 'var(--error-600)', fontSize: '14px', marginTop: '16px' }}>
              Les clés de notification ne sont pas configurées sur ce serveur.
              Les notifications dans l&apos;application restent actives, mais rien
              ne sera affiché hors application.
            </p>
          )}

          {state === 'unsupported' && (
            <p role="alert" style={{ color: 'var(--error-600)', fontSize: '14px', marginTop: '16px' }}>
              Ce navigateur ne gère pas les notifications hors application.
            </p>
          )}

          {state === 'denied' && (
            <p role="alert" style={{ color: 'var(--error-600)', fontSize: '14px', marginTop: '16px' }}>
              Les notifications sont bloquées pour ce site. Autorisez-les dans
              les réglages du navigateur — l&apos;icône à gauche de la barre
              d&apos;adresse — puis rechargez cette page.
            </p>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
            {state === 'granted' ? (
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={handleDisable}
                disabled={isPending}
              >
                {isPending ? 'Désactivation…' : 'Désactiver sur ce poste'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-md"
                onClick={handleEnable}
                disabled={isPending || state === 'unsupported' || state === 'denied' || !vapidConfigured}
              >
                {isPending ? 'Activation…' : 'Activer les notifications'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={handleTest}
              disabled={isPending}
            >
              {isPending ? 'Envoi…' : 'Envoyer une notification d’essai'}
            </button>
          </div>

          {testSent && !error && (
            <p role="status" style={{ color: 'var(--success-600)', fontSize: '14px', marginTop: '16px' }}>
              Notification d&apos;essai envoyée. Elle doit apparaître en bas de
              l&apos;écran, même si ce poste est en arrière-plan. Vous la
              retrouverez aussi dans la liste des notifications, en haut à droite.
            </p>
          )}

          {done && !testSent && !error && (
            <p role="status" style={{ color: 'var(--success-600)', fontSize: '14px', marginTop: '16px' }}>
              Notifications activées sur ce poste.
            </p>
          )}

          {error && (
            <p role="alert" style={{ color: 'var(--error-600)', fontSize: '14px', marginTop: '16px' }}>
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="data-table-wrapper">
        <div className="data-table-header">
          <div>
            <h3 style={{ margin: 0 }}>Postes abonnés</h3>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Chaque poste activé reçoit les notifications de votre compte.
            </span>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Poste</th>
              <th>Activité</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <tr key={subscription.id}>
                <td>{subscription.label || 'Navigateur'}</td>
                <td>
                  {new Date(subscription.lastSeenAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}

            {subscriptions.length === 0 && (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  Aucun poste abonné pour ce compte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}