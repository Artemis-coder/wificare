'use client';

import { useState, useTransition } from 'react';

import { PASSWORD_LENGTH } from '@/lib/roles';
import { signOutAndReset } from '@/lib/sign-out-client';
import { changeOwnPasswordAction } from './actions';

/**
 * Changement du mot de passe du compte connecté.
 *
 * Le profil est le seul endroit où une personne peut agir sur son propre compte :
 * `lib/user-admin` refuse toute auto-modification via la gestion des comptes, à
 * commencer par le mot de passe. Ce formulaire ne contourne pas cette garde, il
 * répond au cas qu'elle ne couvre pas.
 *
 * **La déconnexion fait partie du changement.** Une fois le mot de passe
 * enregistré, la session en cours reste valide : personne d'autre ne pourrait
 * l'annuler, le back-office n'a pas d'annulation de session. Se déconnecter est
 * donc la seule façon de prouver que le nouveau mot de passe fonctionne, et
 * d'éviter qu'un poste de régie partagé reste ouvert sous le compte de celui qui
 * vient de le renouveler.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  /** Garde les champs à leur valeur : un mot de passe ne se réaffiche pas. */
  const onlyDigits = (value: string) =>
    value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    // La saisie est vérifiée avant l'appel pour ne pas faire un aller-retour sur
    // une erreur visible localement. Le serveur revérifie tout de même : ce
    // contrôle est un confort, pas une garantie.
    if (next.length !== PASSWORD_LENGTH) {
      setError(`Le nouveau mot de passe doit comporter ${PASSWORD_LENGTH} chiffres.`);
      return;
    }

    if (next !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    startTransition(async () => {
      const result = await changeOwnPasswordAction(current, next, confirm);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCurrent('');
      setNext('');
      setConfirm('');

      // `changed=1` ne sert qu'à l'écran de connexion, pour confirmer d'où
      // vient la demande de mot de passe plutôt que de laisser croire à une
      // session expirée.
      await signOutAndReset('/login?changed=1');
    });
  };

  return (
    <form onSubmit={submit} className="password-form">
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      <div className="password-field">
        <label className="label" htmlFor="current-password">
          Mot de passe actuel
        </label>
        <input
          id="current-password"
          className="field"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={PASSWORD_LENGTH}
          value={current}
          onChange={(event) => setCurrent(onlyDigits(event.target.value))}
          required
        />
      </div>

      <div className="password-grid">
        <div className="password-field">
          <label className="label" htmlFor="new-password">
            Nouveau mot de passe
          </label>
          <input
            id="new-password"
            className="field"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PASSWORD_LENGTH}
            value={next}
            onChange={(event) => setNext(onlyDigits(event.target.value))}
            required
          />
          <span className="password-hint">
            différent de l&apos;actuel
          </span>
        </div>

        <div className="password-field">
          <label className="label" htmlFor="confirm-password">
            Confirmation
          </label>
          <input
            id="confirm-password"
            className="field"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PASSWORD_LENGTH}
            value={confirm}
            onChange={(event) => setConfirm(onlyDigits(event.target.value))}
            required
          />
          {/* Le désaccord des deux saisies se lit ici plutôt qu'uniquement dans
              l'alerte : les deux champs sont côte à côte, la raison de l'échec
              l'est donc aussi. L'alerte ne sert plus que pour ce que le
              navigateur ne peut pas deviner, comme un mot de passe actuel faux. */}
          {confirm.length > 0 && confirm !== next && (
            <span className="password-hint password-hint-error">
              Les deux saisies diffèrent
            </span>
          )}
        </div>
      </div>

      <div className="password-actions">
        <span className="password-note">
          Vous serez déconnecté après le changement, pour confirmer que le
          nouveau mot de passe fonctionne.
        </span>
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? 'Changement...' : 'Changer le mot de passe'}
        </button>
      </div>
    </form>
  );
}