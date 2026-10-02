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
}: {
  /** Les clés VAPID sont-elles présentes côté serveur ? */
  vapidConfigured: boolean;
  subscriptions: Subscription[];
}) {
  const state = usePushState();
  const [error, setError] = useState<string | null>(null);
  // Une seule confirmation pour les deux gestes : « activé » et « essai envoyé »
  // disent tous deux que le poste est opérationnel, et deux messages
  // simultanés se contrediraient.
  const [done, setDone] = useState<'subscribed' | 'tested' | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEnable() {
    setError(null);
    setDone(null);

    startTransition(async () => {
      const result = await enableWebPush();

      if (!result.ok) {
        setError(result.error ?? 'Activation impossible.');
        return;
      }

      setDone("subscribed");
      window.location.reload();
    });
  }

  function handleDisable() {
    setError(null);
    setDone(null);

    startTransition(async () => {
      await disableWebPush();
      window.location.reload();
    });
  }

  function handleTest() {
    setError(null);

    startTransition(async () => {
      await sendTestNotificationAction();
      setDone("tested");
    });
  }

  return (
    <>
      <div className="data-table-wrapper" style={{ marginBottom: '24px' }}>
        <div className="panel-body">
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

          <div className="filter-row" style={{ marginTop: '20px' }}>
            {state === 'subscribed' ? (
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={handleDisable}
                disabled={isPending}
              >
                {isPending ? 'Désactivation…' : 'Désactiver sur ce poste'}
              </button>
            ) : state === 'loading' ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                Vérification de ce poste…
              </p>
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

          {done && !error && (
            <p role="status" style={{ color: 'var(--success-600)', fontSize: '14px', marginTop: '16px' }}>
              {done === 'tested'
                ? 'Notification d’essai envoyée. Elle doit apparaître en bas de l’écran, même si ce poste est en arrière-plan. Vous la retrouverez aussi dans la liste des notifications, en haut à droite.'
                : 'Notifications activées sur ce poste.'}
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
          <div className="page-header-text">
            <h3 style={{ margin: 0 }}>Postes abonnés</h3>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Chaque poste activé reçoit les notifications de votre compte.
            </span>
          </div>
        </div>
        <div className="table-scroll">
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
                <td data-label="Poste">{subscription.label || 'Navigateur'}</td>
                <td data-label="Activité">
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
                <td colSpan={2} className="table-empty" style={{ color: 'var(--text-secondary)' }}>
                  Aucun poste abonné pour ce compte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}