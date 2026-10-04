'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { AUDIENCE_PHRASE } from '@/lib/broadcast-audiences';
import { BODY_MAX, TITLE_MAX } from '@/lib/broadcast-limits';
import { sendBroadcastAction, type AudienceOption } from './actions';
import BroadcastPreview from './broadcast-preview';

/**
 * Composeur de message de la régie.
 *
 * L'écran est rangé dans l'ordre du geste : qui est prévenu, ce qui est écrit,
 * ce que cela donnera. L'aperçu est à côté du message et non sous le formulaire,
 * parce que c'est en comparant les deux qu'on raccourcit un texte — et parce
 * qu'un formulaire unique qui descendait sur trois écrans obligeait à faire défiler
 * pour relire ce qu'on venait de taper.
 *
 * Le nombre de destinataires est affiché avant l'envoi, et autant leur part de
 * téléphones abonnés : une annonce partie sur les seuls clients, ou sur tout le
 * monde alors que seuls les techniciens sont concernés, se voit ici et pas après
 * coup, une fois partie.
 *
 * L'envoi ne peut pas être annulé, d'où la confirmation explicite, qui récapitule
 * ce qui part et vers qui. Une campagne programmée, elle, se reprend tant qu'elle
 * n'est pas partie — c'est la seule façon de réparer une erreur sans réveiller
 * tout le monde.
 */
export default function BroadcastComposer({
  audiences,
  pushConfigured,
  subscribedAccounts,
  totalAccounts,
}: {
  audiences: AudienceOption[];
  pushConfigured: boolean;
  subscribedAccounts: number;
  totalAccounts: number;
}) {
  const firstUsable = audiences.find((option) => option.count > 0)?.value ?? 'ALL';
  const [audience, setAudience] = useState(firstUsable);
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
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Le bouton d'envoi disparaît sous la confirmation : sans ce report de focus,
  // la tabulation repartait de l'élément suivant le formulaire, et « Annuler »
  // n'était plus atteignable au clavier.
  useEffect(() => {
    if (confirming) {
      confirmButtonRef.current?.focus();
    }
  }, [confirming]);

  const selected = audiences.find((option) => option.value === audience);
  const trimmed = title.trim().length > 0 && body.trim().length > 0;
  const dateUsable = !scheduled || scheduledFor.length > 0;
  const scheduledAt = scheduled && scheduledFor
    ? new Date(scheduledFor)
    : null;
  const sendable =
    !isPending && trimmed && dateUsable && !!selected && selected.count > 0;

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
      const when = scheduledAt;

      const result = await sendBroadcastAction({
        audience,
        title,
        body,
        scheduledFor:
          when && !Number.isNaN(when.getTime()) ? when.toISOString() : undefined,
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
    <div className="broadcast-layout">
      {/* --- À qui --------------------------------------------------------- */}
      <section className="broadcast-col broadcast-col-audience">
        <div className="broadcast-col-head">
          <div>
            <h3 className="broadcast-col-title" style={{ margin: 0 }}>Destinataires</h3>
            <p className="broadcast-col-sub">Qui va être prévenu</p>
          </div>
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="sr-only">Audience du message</legend>
          <div>
            {audiences.map((option) => {
              const checked = audience === option.value;
              const empty = option.count === 0;
              const reach = option.count === 0
                ? 0
                : Math.round((option.devices / option.count) * 100);

              return (
                <label
                  key={option.value}
                  className="audience-option"
                  /* L'état reste porté par le bouton radio natif, seul à savoir
                     le dire à un lecteur d'écran. L'attribut ne sert qu'à
                     colorationner la carte. */
                  data-checked={checked}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={option.value}
                    checked={checked}
                    disabled={empty}
                    onChange={() => {
                      setAudience(option.value);
                      setConfirming(false);
                      setSent(null);
                      setProgrammed(null);
                    }}
                  />

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                      <span className="broadcast-option-title">{option.label}</span>
                      <span className="audience-count">
                        {option.count} destinataire{option.count > 1 ? 's' : ''}
                      </span>
                    </span>

                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {option.hint}
                    </span>

                    {/* L'écart entre les deux chiffres est la seule chose qui
                        distingue « envoyé » de « reçu » : autant le montrer en
                        proportion plutôt qu'en deux nombres à soustraire. */}
                    {option.count > 0 && (
                      <>
                        <span
                          className="reach-meter"
                          role="img"
                          aria-label={`${option.devices} destinataire${option.devices > 1 ? 's' : ''} sur ${option.count} ont un téléphone abonné au push`}
                        >
                          <span
                            className="reach-meter-fill"
                            data-empty={option.devices === 0}
                            style={{ width: `${reach}%` }}
                          />
                        </span>
                        <span className="reach-caption">
                          {option.devices === 0 ? (
                            <span className="reach-caption-strong">
                              Aucun téléphone abonné : visible dans l’application seulement.
                            </span>
                          ) : (
                            <>
                              <strong>{option.devices}</strong> sur {option.count}{' '}
                              {option.devices === 1
                                ? 'le verra'
                                : 'le verront'}{' '}
                              sur son téléphone
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* L'état du push n'est pas une note de bas de page : sans le secret
            Firebase, le serveur enregistre le message et n'envoie rien, sans
            erreur. La régie croirait avoir prévenu des personnes qui n'ont rien
            reçu — c'est le silence le plus coûteux de la console. */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-default)' }}>
          <span className={`status-pip ${pushConfigured ? 'status-pip-success' : 'status-pip-warning'}`}>
            <span className="status-pip-dot" aria-hidden="true" />
            {pushConfigured ? 'Push actif' : 'Push inactif'}
          </span>

          <p className="reach-caption" style={{ marginTop: '8px' }}>
            {pushConfigured
              ? subscribedAccounts === totalAccounts && totalAccounts > 0
                ? 'Tous les comptes actifs ont un téléphone abonné.'
                : `${subscribedAccounts} compte${subscribedAccounts > 1 ? 's' : ''} sur ${totalAccounts} actif${totalAccounts > 1 ? 's' : ''} ${subscribedAccounts > 1 ? 'ont' : 'a'} un téléphone abonné.`
              : 'Le serveur n’a pas le secret Firebase : aucun téléphone ne sera touché.'}
          </p>

          {!pushConfigured && (
            <details className="reach-details">
              <summary>Ce que ça change</summary>
              <p className="reach-details-body">
                Le message sera bien enregistré et visible dans l’application.
                Mais ceux qui l’ont fermée n’en sauront rien : aucun téléphone ne
                sonne. Voir <code>FIREBASE_SERVICE_ACCOUNT</code> côté serveur.
              </p>
            </details>
          )}
        </div>
      </section>

      {/* --- Le message ---------------------------------------------------- */}
      <section className="broadcast-col broadcast-col-message">
        <div className="broadcast-col-head">
          <div>
            <h3 className="broadcast-col-title" style={{ margin: 0 }}>Message</h3>
            <p className="broadcast-col-sub">
              Apparaît dans l’application et sur le téléphone
            </p>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            reset();
          }}
        >
          <label htmlFor="broadcast-title" className="field-label">
            Titre
          </label>
          <input
            id="broadcast-title"
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Coupure réseau sur le secteur nord"
            className="field"
          />
          <p
            className="char-count"
            data-near={title.length >= TITLE_MAX - 12 && title.length < TITLE_MAX}
            data-full={title.length >= TITLE_MAX}
          >
            {title.length} / {TITLE_MAX}
          </p>

          <label
            htmlFor="broadcast-body"
            className="field-label"
            style={{ marginTop: '16px' }}
          >
            Message
          </label>
          <textarea
            id="broadcast-body"
            value={body}
            maxLength={BODY_MAX}
            rows={5}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Intervention en cours, rétablissement prévu dans l'après-midi."
            className="field"
            style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }}
          />
          <p
            className="char-count"
            data-near={body.length >= BODY_MAX - 40 && body.length < BODY_MAX}
            data-full={body.length >= BODY_MAX}
          >
            {body.length} / {BODY_MAX}
          </p>

          {/* Programmation : l'heure est saisie dans le fuseau du poste, et
              affichée telle quelle — la maintenance planifiée se décide toujours
              sur l'heure locale de celui qui l'annonce. */}
<div className="broadcast-reach-status">
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
                  setConfirming(false);
                }}
              />
              Programmer l&apos;envoi
            </label>

            {scheduled && (
              <div style={{ marginTop: '12px' }}>
                <label htmlFor="broadcast-when" className="field-label">
                  Date et heure d&apos;envoi
                </label>
                <input
                  id="broadcast-when"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                  className="field"
                  style={{ maxWidth: '100%' }}
                />
                <p className="field-hint">
                  Heure de ce poste. Le départ effectif peut avoir jusqu&apos;à cinq
                  minutes de retard.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p
              role="alert"
              style={{ color: 'var(--error-600)', fontSize: '14px', marginTop: '16px' }}
            >
              {error}
            </p>
          )}

          {sent && (
            <div className="alert alert-success" role="status" style={{ marginTop: '16px' }}>
              « {sent.title} » envoyé à {sent.recipients} destinataire
              {sent.recipients > 1 ? 's' : ''}, dont {sent.devices} téléphone
              {sent.devices > 1 ? 's' : ''}.
            </div>
          )}

          {programmed && (
            <div className="alert alert-success" role="status" style={{ marginTop: '16px' }}>
              « {programmed.title} » programmé pour le{' '}
              {new Date(programmed.at).toLocaleString('fr-FR')}. Vous pourrez
              l&apos;annuler ou l&apos;envoyer plus tôt.
            </div>
          )}

          {/* L'envoi ne se reprend pas : la confirmation récapitule, et n'est
              posée qu'après le titre et le message — la dernière occasion de
              lire avant que ça sonne. Le focus vient se poser sur « Oui » :
              l'écran suivant le clic, sinon le clavier resterait sur le bouton
              d'envoi qui vient d'être remplacé. */}
          {confirming && (
            <div className="confirm-card" role="group" aria-label="Confirmer l'envoi">
              <p className="confirm-card-title">
                {scheduled ? 'Programmer ce message ?' : 'Envoyer maintenant ?'}
              </p>
              <p className="confirm-card-body">
                {scheduled && scheduledAt && !Number.isNaN(scheduledAt.getTime())
                  ? `« ${title.trim()} » partira le ${scheduledAt.toLocaleString('fr-FR')} pour ${AUDIENCE_PHRASE[audience]}.`
                  : `« ${title.trim()} » partira immédiatement pour ${AUDIENCE_PHRASE[audience]} — ${selected?.count} destinataire${selected && selected.count > 1 ? 's' : ''}.`}
                {selected && selected.count > 0 && selected.devices < selected.count && (
                  <>
                    {' '}
                    {selected.count - selected.devices} ne le verront qu&apos;en
                    ouvrant l&apos;application.
                  </>
                )}
              </p>
              {scheduled && (
                <p className="confirm-card-body" style={{ marginTop: '8px', fontWeight: 600 }}>
                  Vous pourrez l&apos;annuler, ou l&apos;envoyer plus tôt.
                </p>
              )}
              {!scheduled && (
                <p className="confirm-card-body" style={{ marginTop: '8px', fontWeight: 600 }}>
                  Un envoi immédiat ne peut plus être repris.
                </p>
              )}

              <div className="form-actions" style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={handleSubmit}
                  disabled={isPending}
                  ref={confirmButtonRef}
                >
                  {isPending ? 'Envoi…' : scheduled ? 'Oui, programmer' : 'Oui, envoyer'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => setConfirming(false)}
                  disabled={isPending}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={!sendable}
            >
              {scheduled ? 'Programmer' : 'Envoyer maintenant'}
            </button>
            {!trimmed && (
              <span className="field-hint" style={{ alignSelf: 'center', marginTop: 0 }}>
                Titre et message sont requis.
              </span>
            )}
          </div>
        </form>
      </section>

      {/* --- Ce que ça donne ------------------------------------------------ */}
      <BroadcastPreview
        title={title}
        body={body}
        audience={audience}
        audiencePhrase={AUDIENCE_PHRASE[audience]}
        recipients={selected?.count ?? 0}
        devices={selected?.devices ?? 0}
        scheduledAt={
          scheduled && scheduledAt && !Number.isNaN(scheduledAt.getTime())
            ? scheduledAt.toISOString()
            : null
        }
      />
    </div>
  );
}