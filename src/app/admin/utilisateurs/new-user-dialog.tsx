'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ROLE_LABEL, PASSWORD_LENGTH, type AppRole } from '@/lib/roles';
import { createUserAction } from './actions';

const ROLES: AppRole[] = ['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN', 'CLIENT'];

const fieldStyle = {
  height: '38px',
  width: '100%',
  padding: '0 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-strong)',
  fontSize: '14px',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  outline: 'none',
} as const;

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

  return (
    <>
      <button type="button" className="btn btn-primary btn-lg" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouveau compte
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Créer un compte"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 50,
          }}
        >
          <form
            onSubmit={submit}
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--elevation-3)',
              padding: '28px',
              width: '100%',
              maxWidth: '420px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h2 style={{ margin: 0 }}>Créer un compte</h2>

            {error && (
              <div role="alert" style={{ backgroundColor: 'var(--error-50)', color: 'var(--error-600)', padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="label" htmlFor="new-firstName" style={{ display: 'block', marginBottom: '6px' }}>Prénom</label>
                <input id="new-firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} style={fieldStyle} required />
              </div>
              <div>
                <label className="label" htmlFor="new-lastName" style={{ display: 'block', marginBottom: '6px' }}>Nom</label>
                <input id="new-lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} style={fieldStyle} required />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="new-phone" style={{ display: 'block', marginBottom: '6px' }}>Téléphone</label>
              <input id="new-phone" type="tel" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+2250102030405" style={fieldStyle} required />
            </div>

            <div>
              <label className="label" htmlFor="new-role" style={{ display: 'block', marginBottom: '6px' }}>Rôle</label>
              <select id="new-role" value={role} onChange={(event) => setRole(event.target.value as AppRole)} style={fieldStyle}>
                {ROLES.map((item) => (
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
                style={fieldStyle}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => setOpen(false)} disabled={pending}>
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
