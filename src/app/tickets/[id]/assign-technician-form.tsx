'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { assignTicketAction } from '../actions';

type Technician = {
  id: string;
  name: string | null;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  /** Demandes non clôturées affectées au technicien. */
  openTickets: number;
  /** Un technicien hors service ne peut pas recevoir de demande. */
  assignable: boolean;
};

/** Motif du refus d'affectation, tel que l'annuaire le présente. */
const UNAVAILABLE_REASON = {
  INACTIVE: 'inactif',
  SUSPENDED: 'suspendu',
} as const;

/**
 * Motif lisible pour un technicien hors service, ou `null` s'il est en service.
 *
 * `assignable` et `status` voyagent ensemble depuis le serveur ; le type du
 * composant les garde indépendants, d'où le test explicite plutôt qu'un accès
 * direct à l'index — qui n'existe pas pour un compte actif.
 */
function unavailableReason(technician: Technician): string | null {
  return technician.status === 'ACTIVE'
    ? null
    : UNAVAILABLE_REASON[technician.status];
}

/**
 * Affectation d'une demande à un technicien précis.
 *
 * Tous les comptes de rôle technicien sont proposés, y compris ceux qui ne sont
 * pas en service : les seconds apparaissent grisés avec leur motif, sinon la
 * régie cherchait un technicien absent de la liste sans comprendre pourquoi.
 *
 * Le technicien qui reçoit l'intervention est poussé sur son téléphone ; le
 * client, lui, est prévenu qu'un technicien a été désigné. Le message
 * d'erreur est renvoyé par le serveur (action) et non construit ici, afin que
 * l'interface et l'API motivent exactement la même chose.
 */
export default function AssignTechnicianForm({
  ticketId,
  technicians,
  currentTechnicianId,
}: {
  ticketId: string;
  technicians: Technician[];
  currentTechnicianId: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentTechnicianId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const unchanged = selected === (currentTechnicianId ?? '');
  const current = technicians.find((t) => t.id === currentTechnicianId) ?? null;

  // Recherche : une équipe nombreuse rend le sélecteur illisible, et le
  // téléphone suffit à identifier un technicien.
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) return technicians;

    return technicians.filter(
      (technician) =>
        technician.phone.includes(needle) ||
        (technician.name ?? '').toLowerCase().includes(needle),
    );
  }, [query, technicians]);

  const availableCount = technicians.filter((t) => t.assignable).length;

  function handleSubmit() {
    if (!selected) {
      setError('Choisissez un technicien.');
      return;
    }

    setError(null);
    setDone(false);

    startTransition(async () => {
      try {
        await assignTicketAction(ticketId, selected);
        setDone(true);
        router.refresh();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Affectation impossible.'
        );
      }
    });
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <label
        htmlFor="technician-assignment"
        style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}
      >
        Affecter à un technicien
      </label>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un technicien (nom ou téléphone)"
        aria-label="Rechercher un technicien"
        className="field"
        style={{ marginBottom: '8px' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <select
          id="technician-assignment"
          className="field"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={isPending || technicians.length === 0}
          style={{ flex: '1 1 160px' }}
        >
          <option value="">— Choisir un technicien —</option>
          {filtered.map((technician) => (
            <option
              key={technician.id}
              value={technician.id}
              disabled={!technician.assignable}
            >
              {technician.name ?? technician.phone} · {technician.phone}
              {(() => {
                const reason = unavailableReason(technician);

                if (reason) return ` · ${reason}`;

                return technician.openTickets > 0
                  ? ` · ${technician.openTickets} en cours`
                  : ' · disponible';
              })()}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={handleSubmit}
          disabled={isPending || unchanged || !selected}
        >
          {isPending ? 'Affectation…' : 'Affecter'}
        </button>
      </div>

      {technicians.length === 0 && (
        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Aucun compte technicien n&apos;existe pour le moment. Créez-en un depuis
          l&apos;annuaire des utilisateurs.
        </p>
      )}

      {technicians.length > 0 && availableCount === 0 && (
        <p role="alert" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--error-600)' }}>
          Aucun technicien n&apos;est en service : tous les comptes sont inactifs ou
          suspendus. Réactivez-en un pour affecter cette demande.
        </p>
      )}

      {query.trim() && filtered.length === 0 && (
        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Aucun technicien ne correspond à « {query.trim()} ».
        </p>
      )}

      {current && !current.assignable && (
        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--warning-600)' }}>
          Cette demande est actuellement affectée à {current.name ?? current.phone},
          dont le compte est {unavailableReason(current)}.
        </p>
      )}

      {done && !error && (
        <p role="status" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--success-600)' }}>
          Demande affectée. Le technicien et le client ont été prévenus.
        </p>
      )}

      {error && (
        <p role="alert" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--error-600)' }}>
          {error}
        </p>
      )}
    </div>
  );
}