'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { assignTicketAction } from '../actions';

type Technician = {
  id: string;
  name: string | null;
  phone: string;
};

/**
 * Affectation d'une demande à un technicien précis.
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
          caught instanceof Error ? caught.message : "Affectation impossible."
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
      <div style={{ display: 'flex', gap: '8px' }}>
        <select
          id="technician-assignment"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={isPending || technicians.length === 0}
          style={{ flex: 1, padding: '8px 10px', fontSize: '14px' }}
        >
          <option value="">— Choisir un technicien —</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.name ?? technician.phone} · {technician.phone}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={handleSubmit}
          disabled={isPending || unchanged || technicians.length === 0}
        >
          {isPending ? 'Affectation…' : 'Affecter'}
        </button>
      </div>

      {technicians.length === 0 && (
        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Aucun technicien en service pour le moment.
        </p>
      )}

      {done && !error && (
        <p role="status" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--success-600)' }}>
          Demande affectée. Le technicien et le client ont été prévenus.
        </p>
      )}

      {error && (
        <p role="alert" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--danger-600)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
