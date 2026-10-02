'use client';

import { useMemo, useState } from 'react';

import { APP_ROLES, ROLE_LABEL, type AppRole } from '@/lib/roles';
import { UserRowActions } from './user-row-actions';

export type UserListItem = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  role: AppRole;
  roleLabel: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  statusLabel: string;
  badge: string;
  createdAt: string;
  hasPassword: boolean;
  ticketCount: number;
  zoneOwnerCount: number;
};

const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;

const STATUS_BADGE: Record<UserListItem['status'], string> = {
  ACTIVE: 'badge-success',
  INACTIVE: 'badge-neutral',
  SUSPENDED: 'badge-warning',
};

const STATUS_LABEL: Record<UserListItem['status'], string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
};

/**
 * Annuaire filtrable.
 *
 * Le filtrage est local : la page est un instantané de la liste des comptes,
 * et recharger toute la table à chaque frappe n'apporterait rien. Les
 * modifications, elles, passent par l'API et rafraîchissent la liste.
 */
export function UserSearch({
  users,
  currentUserId,
}: {
  users: UserListItem[];
  currentUserId: string;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'ALL' | AppRole>('ALL');
  const [status, setStatus] = useState<'ALL' | UserListItem['status']>('ALL');
  // La liste affichée est celle du serveur, complétée par les modifications
  // faites depuis. Stocker la liste entière dans un état la figerait : un
  // `router.refresh()` après une création ou une action depuis une autre page
  // ne se verrait pas.
  const [overrides, setOverrides] = useState<Record<string, Partial<UserListItem>>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const rows = useMemo(
    () => users.map((user) => ({ ...user, ...overrides[user.id] })),
    [users, overrides]
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((user) => {
      if (role !== 'ALL' && user.role !== role) return false;
      if (status !== 'ALL' && user.status !== status) return false;
      if (!needle) return true;

      return (
        (user.name ?? '').toLowerCase().includes(needle) ||
        user.phone.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, role, status]);

  const applyUpdate = (updated: Partial<UserListItem> & { id: string }) => {
    setOverrides((current) => ({
      ...current,
      [updated.id]: { ...current[updated.id], ...updated },
    }));
    setError('');
  };

  return (
    <div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}

      <div className="data-table-wrapper">
        <div className="data-table-header">
          <div className="filter-row">
            <input
              type="search"
              className="field field-wide"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un nom ou un numéro"
              aria-label="Rechercher un utilisateur"
            />
            <select
              className="field"
              value={role}
              onChange={(event) => setRole(event.target.value as 'ALL' | AppRole)}
              aria-label="Filtrer par rôle"
            >
              <option value="ALL">Tous les rôles</option>
              {APP_ROLES.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABEL[item]}
                </option>
              ))}
            </select>
            <select
              className="field"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'ALL' | UserListItem['status'])}
              aria-label="Filtrer par statut"
            >
              <option value="ALL">Tous les statuts</option>
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {STATUS_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {visible.length} compte(s)
          </span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Activité</th>
                <th>Mot de passe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.id}>
                  <td data-label="Nom">
                    <div style={{ fontWeight: 600 }}>{user.name ?? 'Sans nom'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Inscrit le {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </td>
                  <td data-label="Téléphone" style={{ fontFamily: 'monospace' }}>{user.phone}</td>
                  <td data-label="Rôle">
                    <span className={`badge ${user.badge}`}>
                      <span className="badge-dot" />
                      {user.roleLabel}
                    </span>
                  </td>
                  <td data-label="Statut">
                    <span className={`badge ${STATUS_BADGE[user.status]}`}>
                      <span className="badge-dot" />
                      {user.statusLabel}
                    </span>
                  </td>
                  <td data-label="Activité" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {user.role === 'TECHNICIAN'
                      ? `${user.ticketCount} intervention(s)`
                      : user.role === 'CLIENT'
                        ? `${user.zoneOwnerCount} dossier(s)`
                        : '—'}
                  </td>
                  <td data-label="Mot de passe" style={{ fontSize: '13px' }}>
                    {user.hasPassword ? (
                      <span style={{ color: 'var(--success-600)' }}>Défini</span>
                    ) : (
                      <span style={{ color: 'var(--warning-600)' }}>Absent</span>
                    )}
                  </td>
                  <td className="cell-actions" data-label="Actions">
                    <UserRowActions
                      user={user}
                      isSelf={user.id === currentUserId}
                      onUpdated={applyUpdate}
                      onError={setError}
                      onNotice={setNotice}
                    />
                  </td>
                </tr>
              ))}

              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty" style={{ color: 'var(--text-secondary)' }}>
                    Aucun compte ne correspond à ces critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
