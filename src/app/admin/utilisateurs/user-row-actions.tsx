'use client';

import { useState, useTransition } from 'react';

import { APP_ROLES, ROLE_LABEL, type AppRole } from '@/lib/roles';
import { updateUserAction } from './actions';
import type { UserListItem } from './user-search';

const STATUS_LABEL: Record<UserListItem['status'], string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
};

const selectStyle = {
  height: '32px',
  padding: '0 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-strong)',
  fontSize: '13px',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  outline: 'none',
} as const;

/**
 * Actions d'un compte, réservées au super administrateur.
 *
 * L'interface désactive ce qu'elle sait impossible (son propre compte), mais
 * c'est `updateUser`, dans `lib/user-admin`, qui refuse : elle fait autorité,
 * que l'appel vienne du web ou de l'API.
 */
export function UserRowActions({
  user,
  isSelf,
  onUpdated,
  onError,
  onNotice,
}: {
  user: UserListItem;
  isSelf: boolean;
  onUpdated: (updated: Partial<UserListItem> & { id: string }) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const patch = (body: Record<string, unknown>, notice: string) => {
    startTransition(async () => {
      const result = await updateUserAction(user.id, body);

      if (!result.ok || !result.user) {
        onError(result.error ?? 'Modification impossible.');
        return;
      }

      onUpdated({
        id: user.id,
        role: result.user.role as AppRole,
        roleLabel: result.user.roleLabel,
        status: result.user.status as UserListItem['status'],
        statusLabel:
          STATUS_LABEL[result.user.status as UserListItem['status']] ??
          result.user.status,
        hasPassword: result.user.hasPassword,
      });
      onNotice(notice);
    });
  };

  if (isSelf) {
    return (
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
        Votre compte
      </span>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary btn-md"
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        Gérer
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '38px',
            zIndex: 20,
            minWidth: '260px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--elevation-3)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div>
            <div className="label" style={{ marginBottom: '6px' }}>Rôle</div>
            <select
              value={user.role}
              disabled={pending}
              onChange={(event) =>
                patch(
                  { role: event.target.value },
                  `Rôle mis à jour : ${ROLE_LABEL[event.target.value as AppRole]}.`
                )
              }
              style={{ ...selectStyle, width: '100%' }}
              aria-label={`Rôle de ${user.name ?? user.phone}`}
            >
              {APP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="label" style={{ marginBottom: '6px' }}>Statut</div>
            <select
              value={user.status}
              disabled={pending}
              onChange={(event) =>
                patch(
                  { status: event.target.value },
                  event.target.value === 'ACTIVE'
                    ? 'Compte réactivé.'
                    : 'Compte suspendu.'
                )
              }
              style={{ ...selectStyle, width: '100%' }}
              aria-label={`Statut de ${user.name ?? user.phone}`}
            >
              <option value="ACTIVE">Actif</option>
              <option value="INACTIVE">Inactif</option>
              <option value="SUSPENDED">Suspendu</option>
            </select>
          </div>

          <ResetPasswordButton
            pending={pending}
            onReset={(password) => patch({ password }, 'Mot de passe réinitialisé.')}
          />
        </div>
      )}
    </div>
  );
}

/** Réinitialise le mot de passe d'un compte à un nouveau code de 4 chiffres. */
function ResetPasswordButton({
  pending,
  onReset,
}: {
  pending: boolean;
  onReset: (password: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-md"
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        style={{ width: '100%' }}
      >
        Réinitialiser le mot de passe
      </button>

      {open && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={password}
            onChange={(event) => setPassword(event.target.value.replace(/\D/g, ''))}
            placeholder="4 chiffres"
            aria-label="Nouveau mot de passe"
            style={{ ...selectStyle, flex: 1, height: '34px' }}
          />
          <button
            type="button"
            className="btn btn-primary btn-md"
            disabled={pending || password.length !== 4}
            onClick={() => onReset(password)}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
