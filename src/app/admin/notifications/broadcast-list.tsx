'use client';

import { useState, useTransition } from 'react';

import type { BroadcastRow } from '@/lib/broadcast';
import {
  cancelBroadcastAction,
  sendScheduledBroadcastAction,
} from './actions';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Programmée',
  SENDING: 'En cours',
  SENT: 'Envoyée',
  CANCELLED: 'Annulée',
  FAILED: 'Échouée',
};

/**
 * Campagnes programmées et dernières campagnes.
 *
 * Une campagne programmée est modifiable jusqu'au départ : c'est le seul moment
 * où une erreur se rattrape sans réveiller la plateforme. L'état est affiché
 * pour chaque ligne, y compris les échecs — une campagne partie en silence
 * laisserait croire qu'elle est partie, alors qu'elle a peut-être touché
 * personne.
 */
export default function BroadcastList({
  scheduled,
  history,
}: {
  scheduled: BroadcastRow[];
  history: BroadcastRow[];
}) {
  return (
    <>
      <ScheduledList scheduled={scheduled} />
      <HistoryList history={history} />
    </>
  );
}

function ScheduledList({ scheduled }: { scheduled: BroadcastRow[] }) {
  return (
    <div className="data-table-wrapper" style={{ marginBottom: '24px' }}>
      <div className="data-table-header">
        <div>
          <h3 style={{ margin: 0 }}>Programmées</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {scheduled.length === 0
              ? 'Aucun message en attente.'
              : `${scheduled.length} message${scheduled.length > 1 ? 's' : ''} en attente d’envoi.`}
          </span>
        </div>
      </div>

      {scheduled.length === 0 ? null : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Audience</th>
              <th>Envoi prévu</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {scheduled.map((broadcast) => (
              <ScheduledRow key={broadcast.id} broadcast={broadcast} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ScheduledRow({ broadcast }: { broadcast: BroadcastRow }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancel() {
    setError(null);

    startTransition(async () => {
      const result = await cancelBroadcastAction({ id: broadcast.id });

      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  function sendNow() {
    setError(null);

    startTransition(async () => {
      const result = await sendScheduledBroadcastAction({ id: broadcast.id });

      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <tr>
      <td>
        <strong>{broadcast.title}</strong>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {broadcast.body}
        </div>
        {error && (
          <div role="alert" style={{ fontSize: '13px', color: 'var(--error-600)' }}>
            {error}
          </div>
        )}
      </td>
      <td>{audienceLabel(broadcast.audience)}</td>
      <td>
        {new Date(broadcast.scheduledFor).toLocaleString('fr-FR', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </td>
      <td>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={sendNow}
            disabled={isPending}
          >
            {isPending ? '…' : 'Envoyer maintenant'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={cancel}
            disabled={isPending}
          >
            Annuler
          </button>
        </div>
      </td>
    </tr>
  );
}

function HistoryList({ history }: { history: BroadcastRow[] }) {
  return (
    <div className="data-table-wrapper">
      <div className="data-table-header">
        <div>
          <h3 style={{ margin: 0 }}>Messages envoyés</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Destinataires et téléphones atteints, mesurés à l&apos;envoi.
          </span>
        </div>
      </div>

      {history.length === 0 ? (
        <div style={{ padding: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          Aucun message envoyé pour l&apos;instant.
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Audience</th>
              <th>Destinataires</th>
              <th>État</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {history.map((broadcast) => (
              <tr key={broadcast.id}>
                <td>
                  <strong>{broadcast.title}</strong>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {broadcast.body}
                  </div>
                  {broadcast.failureReason && (
                    <div style={{ fontSize: '13px', color: 'var(--error-600)' }}>
                      {broadcast.failureReason}
                    </div>
                  )}
                </td>
                <td>{audienceLabel(broadcast.audience)}</td>
                <td>
                  {broadcast.status === 'SENT'
                    ? broadcast.devices === null
                      ? `${broadcast.recipients} (téléphones non mesurés)`
                      : `${broadcast.recipients} dont ${broadcast.devices} téléphone${
                          broadcast.devices > 1 ? 's' : ''
                        }`
                    : '—'}
                </td>
                <td>
                  <span style={{ color: statusColor(broadcast.status) }}>
                    {STATUS_LABEL[broadcast.status] ?? broadcast.status}
                  </span>
                </td>
                <td>
                  {new Date(broadcast.sentAt ?? broadcast.scheduledFor).toLocaleString(
                    'fr-FR',
                    { dateStyle: 'medium', timeStyle: 'short' }
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function audienceLabel(audience: string): string {
  switch (audience) {
    case 'ALL':
      return 'Tout le monde';
    case 'CLIENTS':
      return 'Propriétaires de zone';
    case 'TECHNICIANS':
      return 'Techniciens';
    case 'STAFF':
      return 'Équipe d’administration';
    default:
      return audience;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'SENT':
      return 'var(--success-600)';
    case 'FAILED':
      return 'var(--error-600)';
    case 'SCHEDULED':
      return 'var(--brand-600, var(--brand-500))';
    default:
      return 'var(--text-secondary)';
  }
}