'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import type { BroadcastAudience } from '@/lib/broadcast-audiences';

/**
 * Aperçu du message tel qu'il tombera sur un téléphone.
 *
 * Écrire un message de régie sans le voir est le seul endroit où l'on se trompe
 * sans s'en apercevoir : 240 caractères écrits dans une zone de saisie en font
 * 240, et sur l'écran verrouillé il n'y a que quatre lignes. L'aperçu applique
 * donc les mêmes contraintes que le téléphone — deux lignes de titre, quatre de
 * message — et annonce ce qu'elles font perdre.
 *
 * Il mesure plutôt qu'estimer : prévenir « le titre sera tronqué » parce que le
 * texte dépasse 49 caractères revenait à se tromper une fois sur deux, la
 * largeur utile dépendant de ce qui est écrit. La mesure porte sur ce qui est
 * réellement rendu.
 *
 * Ce qu'il ne montre pas, et le dit : Android n'affiche la notification que si
 * le destinataire a donné son accord. La part des téléphones réellement
 * joignables est donc annoncée sous le cadre, à côté de ce qu'aucun aperçu ne
 * rattrape — un message qui ne partsira que dans l'application.
 */
export default function BroadcastPreview({
  title,
  body,
  audience,
  audiencePhrase,
  recipients,
  devices,
  scheduledAt,
}: {
  title: string;
  body: string;
  /** L'audience choisie, lue par les lecteurs d'écran quand l'aperçu change. */
  audience: BroadcastAudience;
  /** L'audience nommée pour tenir au milieu d'une phrase. */
  audiencePhrase: string;
  recipients: number;
  /** Dont possédant un téléphone abonné au push. */
  devices: number;
  /** ISO de l'envoi programmé, si l'envoi ne part pas maintenant. */
  scheduledAt: string | null;
}) {
  const titleRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState({ title: false, body: false });

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  // `useLayoutEffect` et non `useEffect` : la mesure précède la peinture, pour
  // que l'avertissement n'apparaisse pas une image après l'aperçu.
  useLayoutEffect(() => {
    const titleEl = titleRef.current;
    const bodyEl = bodyRef.current;

    setClipped({
      title: !!titleEl && titleEl.scrollHeight > titleEl.clientHeight + 1,
      body: !!bodyEl && bodyEl.scrollHeight > bodyEl.clientHeight + 1,
    });
  }, [trimmedTitle, trimmedBody]);

  const onlyInApp = recipients > 0 && devices === 0;
  // Tout le monde est joignable : le « 3 sur 3 » n'apprend rien, et la phrase
  // desert mieux qu'un chiffre qui se répète.
  const fullCoverage = recipients > 0 && devices === recipients;
  // Le verbe s'accorde au nombre de téléphones et non à celui des
  // destinataires : « 1 sur 2 le verra », « 2 sur 3 le verront ».
  const verb =
    devices === 0 ? 'ne le verront pas' : devices === 1 ? 'le verra' : 'le verront';

  return (
    <div className="broadcast-col broadcast-col-preview">
      <div className="broadcast-col-head">
        <div>
          <h3 className="broadcast-col-title" style={{ margin: 0 }}>Aperçu</h3>
          <p className="broadcast-col-sub">Sur l&apos;écran verrouillé</p>
        </div>
      </div>

      <div className="phone-frame">
        <div className="phone-screen">
          <div className="phone-status-bar">
            <span>9:41</span>
            <span aria-hidden="true">▮▮▮</span>
          </div>

          <div className="push-notification">
            <div className="push-notification-head">
              <span className="push-notification-icon" aria-hidden="true">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
                </svg>
              </span>
              Wi-Fi Care
            </div>

            {trimmedTitle && (
              <div className="push-notification-title" ref={titleRef}>
                {trimmedTitle}
              </div>
            )}

            {trimmedBody ? (
              <div className="push-notification-body" ref={bodyRef}>
                {trimmedBody}
              </div>
            ) : (
              <div className="push-notification-empty">
                Le message s&apos;affichera ici.
              </div>
            )}

            {trimmedTitle.length === 0 && (
              <div className="push-notification-empty">
                Écrivez un titre pour le voir apparaître.
              </div>
            )}
          </div>
        </div>
      </div>

      {(clipped.title || clipped.body) && (
        <p className="preview-truncation">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: 2 }}
            aria-hidden="true"
          >
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <span>
            {clipped.title && clipped.body
              ? 'Titre et message seront tronqués sur le téléphone.'
              : clipped.title
                ? 'Le titre sera tronqué sur le téléphone.'
                : 'Le message sera tronqué sur le téléphone.'}
          </span>
        </p>
      )}

      <p className="preview-foot">
        {scheduledAt
          ? `Partira le ${new Date(scheduledAt).toLocaleString('fr-FR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}`
          : `Immédiatement, pour ${audiencePhrase}`}
      </p>

      <p className="reach-caption" style={{ textAlign: 'center', marginTop: 4 }}>
        {onlyInApp
          ? `Aucun des ${recipients} destinataires n’a de téléphone abonné : ce message n’apparaîtra que dans l’application.`
          : fullCoverage
            ? recipients === 1
              ? 'Le destinataire le verra sur son téléphone.'
              : 'Tous les destinataires le verront sur leur téléphone.'
            : `${devices} sur ${recipients} ${verb} sur son téléphone.`}
      </p>

      <span className="sr-only" aria-live="polite">
        {audience
          ? `Aperçu pour ${audiencePhrase}. ${recipients} destinataires, dont ${devices} sur leur téléphone.`
          : ''}
      </span>
    </div>
  );
}