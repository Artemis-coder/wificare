'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  deleteZoneAction,
  editZoneAction,
  rejectZoneAction,
  validateZoneAction,
} from './actions';

/**
 * Liste des Wi-Fi Zones.
 *
 * La recherche est locale : la page est un instantané du parc, et recharger
 * toutes les zones à chaque frappe n'apporterait rien. Les actions, elles,
 * passent par les server actions puis rafraîchissent la page — le statut de
 * validation est une décision de régie, il ne doit pas exister uniquement dans
 * l'état d'un onglet.
 */

type ZoneRow = {
  id: string;
  name: string;
  location: string;
  status: 'PENDING' | 'ACTIVE';
  createdAt: string;
  ownerName: string;
  ownerContact: string;
  equipmentCount: number;
  ticketCount: number;
};

const STATUS_BADGE: Record<ZoneRow['status'], string> = {
  PENDING: 'badge-warning',
  ACTIVE: 'badge-success',
};

const STATUS_LABEL: Record<ZoneRow['status'], string> = {
  PENDING: 'En attente de validation',
  ACTIVE: 'Validée',
};

type StatusFilter = 'ALL' | ZoneRow['status'];

const STATUSES: readonly StatusFilter[] = ['ALL', 'PENDING', 'ACTIVE'];

const inputStyle = {
  height: '38px',
  padding: '0 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-strong)',
  fontSize: '14px',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  outline: 'none',
} as const;

export function ZoneList({
  zones,
  canManage,
  initialStatus = 'ALL',
}: {
  zones: ZoneRow[];
  canManage: boolean;
  initialStatus?: StatusFilter;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return zones.filter((zone) => {
      if (status !== 'ALL' && zone.status !== status) return false;
      if (!needle) return true;

      return (
        zone.name.toLowerCase().includes(needle) ||
        zone.location.toLowerCase().includes(needle) ||
        zone.ownerName.toLowerCase().includes(needle) ||
        zone.ownerContact.toLowerCase().includes(needle)
      );
    });
  }, [zones, search, status]);

  /**
   * Lance une action puis rafraîchit la page.
   *
   * Le message d'erreur est celui renvoyé par `lib/zones` : un refus motivé —
   * zone portant des demandes, droits insuffisants — ne doit pas se confondre
   * avec une panne technique, sinon la régie ne comprend pas pourquoi le bouton
   * n'a rien fait.
   */
  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string
  ) => {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        setError(result.error ?? 'Action impossible.');
        return;
      }

      setError('');
      setNotice(successMessage);
      setEditing(null);
      router.refresh();
    });
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--error-50)',
            color: 'var(--error-600)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          style={{
            backgroundColor: 'var(--success-50)',
            color: 'var(--success-600)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {notice}
        </div>
      )}

      <div className="data-table-wrapper">
        <div className="data-table-header">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une zone, un emplacement ou un propriétaire"
              aria-label="Rechercher une Wi-Fi Zone"
              style={{ ...inputStyle, minWidth: '320px' }}
            />
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as StatusFilter)
              }
              aria-label="Filtrer par statut de validation"
              style={inputStyle}
            >
              <option value="ALL">Tous les statuts</option>
              {STATUSES.filter((item) => item !== 'ALL').map((item) => (
                <option key={item} value={item}>
                  {STATUS_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {visible.length} zone(s)
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Propriétaire</th>
                <th>Validation</th>
                <th>Activité</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((zone) => (
                <tr key={zone.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{zone.name}</div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {zone.location}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Déclarée le{' '}
                      {new Date(zone.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {zone.ownerName}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {zone.ownerContact}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${STATUS_BADGE[zone.status]}`}
                    >
                      <span className="badge-dot" />
                      {STATUS_LABEL[zone.status]}
                    </span>
                  </td>
                  <td
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {zone.equipmentCount} équipement(s) ·{' '}
                    {zone.ticketCount} demande(s)
                  </td>
                  <td>
                    {editing === zone.id ? (
                      <ZoneEditForm
                        zone={zone}
                        pending={false}
                        onCancel={() => setEditing(null)}
                        onSubmit={(patch) =>
                          run(
                            () => editZoneAction(zone.id, patch),
                            `Zone ${patch.name ?? zone.name} modifiée.`
                          )
                        }
                      />
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {canManage && zone.status === 'PENDING' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-md"
                            onClick={() =>
                              run(
                                () => validateZoneAction(zone.id),
                                `Zone ${zone.name} validée.`
                              )
                            }
                          >
                            Valider
                          </button>
                        )}

                        {canManage && zone.status === 'ACTIVE' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-md"
                            onClick={() =>
                              run(
                                () => rejectZoneAction(zone.id),
                                `Zone ${zone.name} remise en attente de validation.`
                              )
                            }
                          >
                            Mettre en attente
                          </button>
                        )}

                        {canManage && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-md"
                              onClick={() => setEditing(zone.id)}
                            >
                              Éditer
                            </button>

                            {/* Intervenir ouvre le formulaire de demande sur cette
                                zone : la régie déclare ainsi une intervention
                                au même endroit qu'elle suit le parc. */}
                            <Link
                              href={`/tickets/new?wifiZoneId=${zone.id}`}
                              className="btn btn-secondary btn-md"
                            >
                              Intervenir
                            </Link>

                            <button
                              type="button"
                              className="btn btn-secondary btn-md"
                              style={{ color: 'var(--error-600)' }}
                              onClick={() =>
                                run(
                                  () => deleteZoneAction(zone.id),
                                  `Zone ${zone.name} supprimée.`
                                )
                              }
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: 'center',
                      padding: '40px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Aucune Wi-Fi Zone ne correspond à ces critères.
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

/** Formulaire d'édition en ligne : nom et emplacement de la zone. */
function ZoneEditForm({
  zone,
  pending,
  onCancel,
  onSubmit,
}: {
  zone: ZoneRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (patch: { name: string; location: string }) => void;
}) {
  const [name, setName] = useState(zone.name);
  const [location, setLocation] = useState(zone.location);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, location });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '260px' }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nom de la zone"
        aria-label={`Nom de la zone ${zone.name}`}
        style={inputStyle}
        required
      />
      <input
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder="Emplacement"
        aria-label={`Emplacement de la zone ${zone.name}`}
        style={inputStyle}
        required
      />
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="submit"
          className="btn btn-primary btn-md"
          disabled={pending}
        >
          Enregistrer
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-md"
          onClick={onCancel}
          disabled={pending}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}