'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { APP_ROLES, ROLE_LABEL, PASSWORD_LENGTH, type AppRole } from '@/lib/roles';
import { createUserAction } from './actions';

/**
 * Création d'un compte par le super administrateur.
 *
 * L'inscription publique n'accepte que technicien et propriétaire de zone : un
 * compte d'administration ne peut pas s'attribuer lui-même ses droits. Cette
 * boîte ne montre donc que ce que l'inscription ne fait pas.
 */
export function NewUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>('TECHNICIAN');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  /** Bouton d'ouverture, pour lui rendre le focus à la fermeture. */
  const trigger = useRef<HTMLButtonElement>(null);
  /** Premier champ : le curseur entre directement dans le formulaire. */
  const firstField = useRef<HTMLInputElement>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    startTransition(async () => {
      const result = await createUserAction({ firstName, lastName, phone, password, role });

      if (!result.ok) {
        setError(result.error ?? 'Création impossible.');
        return;
      }

      setOpen(false);
      setFirstName('');
      setLastName('');
      setPhone('');
      setPassword('');
      router.refresh();
    });
  };

  // La modale se ferme à la touche Échap et rend le focus au bouton qui l'a
  // ouverte. Sans cela, elle n'a qu'une sortie — le bouton « Annuler », en bas
  // d'un formulaire qui peut déborder sur téléphone — et le clavier ne peut
  // plus en sortir du tout.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    firstField.current?.focus();

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-lg"
        ref={trigger}
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouveau compte
      </button>

      {open && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Créer un compte"
        >
          <form className="modal-panel" onSubmit={submit}>
            <h2 style={{ margin: 0 }}>Créer un compte</h2>

            {error && (
              <div role="alert" className="alert alert-error">
                {error}
              </div>
            )}

            <div className="two-col-grid">
              <div>
                <label className="label" htmlFor="new-firstName" style={{ display: 'block', marginBottom: '6px' }}>Prénom</label>
                <input id="new-firstName" ref={firstField} value={firstName} onChange={(event) => setFirstName(event.target.value)} className="field" required />
              </div>
              <div>
                <label className="label" htmlFor="new-lastName" style={{ display: 'block', marginBottom: '6px' }}>Nom</label>
                <input id="new-lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} className="field" required />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="new-phone" style={{ display: 'block', marginBottom: '6px' }}>Téléphone</label>
              <input id="new-phone" type="tel" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+2250102030405" className="field" required />
            </div>

            <div>
              <label className="label" htmlFor="new-role" style={{ display: 'block', marginBottom: '6px' }}>Rôle</label>
              <select id="new-role" value={role} onChange={(event) => setRole(event.target.value as AppRole)} className="field">
                {APP_ROLES.map((item) => (
                  <option key={item} value={item}>
                    {ROLE_LABEL[item]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="new-password" style={{ display: 'block', marginBottom: '6px' }}>
                Mot de passe ({PASSWORD_LENGTH} chiffres)
              </label>
              <input
                id="new-password"
                type="text"
                inputMode="numeric"
                maxLength={PASSWORD_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value.replace(/\D/g, ''))}
                className="field"
                required
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                disabled={pending}
              >
                Annuler
              </button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
                {pending ? 'Création...' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
