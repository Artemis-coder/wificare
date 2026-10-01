'use client';

import { useState, useTransition } from 'react';

import {
  sendBroadcastAction,
  type AudienceOption,
} from './actions';

/**
 * Composeur de message de la régie.
 *
 * Le nombre de destinataires est affiché avant l'envoi : une annonce de coupure
 * partie sur les seuls clients, ou sur tout le monde alors que seuls les
 * techniciens sont concernés, se voit ici et pas après coup, une fois partie.
 *
 * L'envoi ne peut pas être annulé, d'où la confirmation explicite. Une campagne
 * programmée, elle, se reprend tant qu'elle n'est pas partie — c'est la seule
 * façon de réparer une erreur sans réveiller tout le monde.
 */
export default function BroadcastComposer({
  audiences,
}: {
  audiences: AudienceOption[];
}) {
  const [audience, setAudience] = useState(audiences[0]?.value ?? 'ALL');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    title: string;
    recipients: number;
    devices: number;
  } | null>(null);
  const [programmed, setProgrammed] = useState<{ title: string; at: string } | null>(
    null
  );
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = audiences.find((option) => option.value === audience);
  const trimmed = title.trim().length > 0 && body.trim().length > 0;
  const dateUsable = !scheduled || scheduledFor.length > 0;

  function reset() {
    setError(null);
    setSent(null);
    setProgrammed(null);
    setConfirming(true);
  }

  function handleSubmit() {
    setError(null);

    startTransition(async () => {
      // `datetime-local` rend l'heure locale du navigateur ; c'est cette heure
      // que la régie a choisie, et elle est convertie en UTC ici. L'affichage
      // refait le chemin inverse, donc la campagne se lit à la bonne heure quel
      // que soit le poste qui la consulte.
      const when = scheduled ? new Date(scheduledFor) : null;

      const result = await sendBroadcastAction({
        audience,
        title,
        body,
        scheduledFor: when && !Number.isNaN(when.getTime())
          ? when.toISOString()
          : undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Le type de retour du serveur confirme ce que l'écran pensait avoir
      // demandé : les deux conditions se recoupent volontairement, pour qu'une
      // heure invalide affichée comme un envoi programmé n'arrive jamais.
      if (result.kind === 'SCHEDULED' && when) {
        setProgrammed({ title: title.trim(), at: when.toISOString() });
      } else if (result.kind === 'SENT') {
        setSent({
          title: title.trim(),
          recipients: result.recipients,
          devices: result.devices,
        });
      }

      setConfirming(false);
      setTitle('');
      setBody('');
      setScheduledFor('');
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
          reset();
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
          maxLength={80}
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
          maxLength={240}
          rows={4}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Intervention en cours, rétablissement prévu dans l'après-midi."
          style={{ width: '100%', padding: '10px 12px', fontSize: '14px', resize: 'vertical' }}
        />
        <div style={{ fontSize: '12px', color: 'var(--text-disabled)', marginTop: '4px' }}>
          {body.length} / 240
        </div>

        {/* Programmation : l'heure est saisie dans le fuseau du poste, et
            affichée telle quelle — la maintenance planifiée se décide toujours
            sur l'heure locale de celui qui l'annonce. */}
        <div style={{ marginTop: '20px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={scheduled}
              onChange={(event) => {
                setScheduled(event.target.checked);
                setError(null);
                setSent(null);
                setProgrammed(null);
              }}
            />
            Programmer l&apos;envoi
          </label>

          {scheduled && (
            <div style={{ marginTop: '10px' }}>
              <label
                htmlFor="broadcast-when"
                style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}
              >
                Date et heure d&apos;envoi
              </label>
              <input
                id="broadcast-when"
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                style={{
                  padding: '10px 12px',
                  fontSize: '14px',
                  width: '100%',
                  maxWidth: '280px',
                }}
              />
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                Heure de ce poste. Le départ effectif peut avoir jusqu&apos;à cinq
                minutes de retard.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="btn btn-primary btn-md"
            disabled={isPending || !trimmed || !dateUsable || !selected || selected.count === 0}
          >
            {scheduled
              ? 'Programmer'
              : `Envoyer à ${selected?.label.toLowerCase() ?? ''}`}
          </button>

          {confirming && (
            <>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                {scheduled
                  ? `Programmer pour le ${new Date(scheduledFor).toLocaleString('fr-FR')}`
                  : `Confirmer l'envoi à ${selected?.count} destinataire${
                      selected && selected.count > 1 ? 's' : ''
                    } ?`}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? 'Envoi…' : 'Oui, confirmer'}
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
            {sent.recipients > 1 ? 's' : ''}, dont {sent.devices} téléphone
            {sent.devices > 1 ? 's' : ''}.
          </p>
        )}

        {programmed && (
          <p role="status" style={{ color: 'var(--success-600)', fontSize: '14px', marginTop: '16px' }}>
            « {programmed.title} » programmé pour le{' '}
            {new Date(programmed.at).toLocaleString('fr-FR')}. Vous pourrez
            l&apos;annuler ou l&apos;envoyer plus tôt.
          </p>
        )}
      </form>
    </div>
  );
}