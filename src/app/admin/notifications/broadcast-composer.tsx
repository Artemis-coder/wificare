'use client';

import { useState, useTransition } from 'react';

import {
  sendBroadcastAction,
  type AudienceOption,
  type SentBroadcast,
} from './actions';

/** Longueurs alignées sur celles validées côté serveur. */
const TITLE_MAX = 80;
const BODY_MAX = 240;

/**
 * Composeur de message de la régie.
 *
 * Le nombre de destinataires est affiché avant l'envoi : une annonce de coupure
 * partie sur les seuls clients, ou sur tout le monde alors que seuls les
 * techniciens sont concernés, se voit ici et pas après coup, une fois partie.
 *
 * L'envoi ne peut pas être annulé, d'où la confirmation explicite.
 */
export default function BroadcastComposer({
  audiences,
}: {
  audiences: AudienceOption[];
}) {
  const [audience, setAudience] = useState(audiences[0]?.value ?? 'ALL');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ title: string; recipients: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = audiences.find((option) => option.value === audience);
  const trimmed = title.trim().length > 0 && body.trim().length > 0;

  function handleSubmit() {
    setError(null);

    startTransition(async () => {
      const result = await sendBroadcastAction({ audience, title, body });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSent({ title: title.trim(), recipients: result.recipients });
      setConfirming(false);
      setTitle('');
      setBody('');
    });
  }

  return (
    <div className="data-table-wrapper" style={{ marginBottom: '24px' }}>
      <div className="data-table-header">
        <div>
          <h3 style={{ margin: 0 }}>Envoyer un message</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Le message apparaît dans l&apos;application et sur le téléphone des
            destinataires, même application fermée.
          </span>
        </div>
      </div>

      <form
        style={{ padding: '24px' }}
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSent(null);
          setConfirming(true);
        }}
      >
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend
            style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', padding: 0 }}
          >
            Destinataires
          </legend>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
            {audiences.map((option) => (
              <label
                key={option.value}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  border: `1px solid ${
                    audience === option.value
                      ? 'var(--brand-500)'
                      : 'var(--border-default)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor:
                    audience === option.value ? 'var(--brand-50)' : 'transparent',
                  cursor: option.count === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="audience"
                  value={option.value}
                  checked={audience === option.value}
                  disabled={option.count === 0}
                  onChange={() => setAudience(option.value)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>
                    {option.label}
                    <span
                      style={{
                        marginLeft: '8px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                      }}
                    >
                      {option.count} destinataire{option.count > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {option.hint}
                  </span>
                  {/* L'écart entre les deux chiffres est la seule chose qui
                      distingue « envoyé » de « reçu » : autant le dire ici. */}
                  {option.count > 0 && option.devices < option.count && (
                    <span
                      style={{
                        display: 'block',
                        marginTop: '4px',
                        fontSize: '12px',
                        color: 'var(--warning-600, var(--text-secondary))',
                      }}
                    >
                      {option.devices === 0
                        ? 'Aucun téléphone abonné : le message n’apparaîtra que dans l’application, et ceux qui l’ont fermée ne le verront pas.'
                        : `${option.count - option.devices} sans téléphone abonné : leur message n’apparaîtra que dans l’application.`}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label
          htmlFor="broadcast-title"
          style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}
        >
          Titre
        </label>
        <input
          id="broadcast-title"
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Coupure réseau sur le secteur nord"
          style={{ width: '100%', padding: '10px 12px', fontSize: '14px', marginBottom: '16px' }}
        />

        <label
          htmlFor="broadcast-body"
          style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}
        >
          Message
        </label>
        <textarea
          id="broadcast-body"
          value={body}
          maxLength={BODY_MAX}
          rows={4}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Intervention en cours, rétablissement prévu dans l'après-midi."
          style={{ width: '100%', padding: '10px 12px', fontSize: '14px', resize: 'vertical' }}
        />
        <div style={{ fontSize: '12px', color: 'var(--text-disabled)', marginTop: '4px' }}>
          {body.length} / {BODY_MAX}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="btn btn-primary btn-md"
            disabled={isPending || !trimmed || !selected || selected.count === 0}
          >
            Envoyer à {selected?.label.toLowerCase() ?? ''}
          </button>

          {confirming && (
            <>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                Confirmer l&apos;envoi à {selected?.count} destinataire
                {selected && selected.count > 1 ? 's' : ''} ?
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? 'Envoi…' : 'Oui, envoyer'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => setConfirming(false)}
                disabled={isPending}
              >
                Annuler
              </button>
            </>
          )}
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--error-600)', fontSize: '14px', marginTop: '16px' }}>
            {error}
          </p>
        )}

        {sent && (
          <p role="status" style={{ color: 'var(--success-600)', fontSize: '14px', marginTop: '16px' }}>
            « {sent.title} » envoyé à {sent.recipients} destinataire
            {sent.recipients > 1 ? 's' : ''}. C&apos;est déjà dans leur application,
            et sur leur téléphone s&apos;il l&apos;a ouverte.
          </p>
        )}
      </form>
    </div>
  );
}

/** Derniers messages envoyés, avec leur audience et leur date. */
export function BroadcastHistory({
  broadcasts,
  audienceLabel,
}: {
  broadcasts: SentBroadcast[];
  audienceLabel: string;
}) {
  if (broadcasts.length === 0) {
    return null;
  }

  return (
    <div className="data-table-wrapper">
      <div className="data-table-header">
        <div>
          <h3 style={{ margin: 0 }}>Messages envoyés</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Chaque envoi n&apos;atteint que les comptes actifs de « {audienceLabel} ».
          </span>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Message</th>
            <th>Destinataires</th>
            <th>Envoyé le</th>
          </tr>
        </thead>
        <tbody>
          {broadcasts.map((broadcast) => (
            <tr key={broadcast.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{broadcast.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {broadcast.body}
                </div>
              </td>
              <td>{broadcast.recipients}</td>
              <td>
                {new Date(broadcast.createdAt).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}