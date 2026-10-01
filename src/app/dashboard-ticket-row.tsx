'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Priority, TicketStatus } from '@prisma/client';

import { getPriorityBadgeClass, getStatusBadgeClass } from './tickets/badges';

type RowTicket = {
  id: string;
  reference: string;
  type: string;
  priority: Priority;
  status: TicketStatus;
  client: { name: string | null };
  wifiZone: { name: string; location: string };
  technician: { name: string | null } | null;
};

/** Types d'installation, distingués des pannes par la couleur du libellé. */
const INSTALLATION_TYPES = [
  'Installation Antenne',
  'Nouveau Routeur',
  'Extension Couverture',
  'Nouvelle Installation',
];

export function isInstallationType(type: string): boolean {
  return INSTALLATION_TYPES.includes(type);
}

/**
 * Ligne du tableau des dernières demandes du tableau de bord.
 *
 * Toute la ligne mène au détail, comme sur la liste des demandes : sans cela le
 * tableau de bord ne servait qu'à lire, et la régie devait repasser par la liste
 * pour agir. La référence est un vrai lien, pour que la ligne reste atteignable
 * au clavier.
 */
export default function DashboardTicketRow({ ticket }: { ticket: RowTicket }) {
  const router = useRouter();

  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => router.push(`/tickets/${ticket.id}`)}>
      <td style={{ fontWeight: 700, color: 'var(--brand-600)' }}>
        <Link
          href={`/tickets/${ticket.id}`}
          onClick={(event) => event.stopPropagation()}
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {ticket.reference}
        </Link>
      </td>
      <td>
        <div style={{ fontWeight: 600 }}>{ticket.wifiZone.name}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {ticket.client.name} • {ticket.wifiZone.location}
        </div>
      </td>
      <td style={{ fontWeight: 500 }}>
        {isInstallationType(ticket.type) ? (
          <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>
            {ticket.type}
          </span>
        ) : (
          <span>{ticket.type}</span>
        )}
      </td>
      <td>
        <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>
          {ticket.priority}
        </span>
      </td>
      <td>
        {ticket.technician ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: 'var(--brand-100)',
                color: 'var(--brand-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {ticket.technician.name?.[0] || 'T'}
            </div>
            <span style={{ fontWeight: 500 }}>{ticket.technician.name}</span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-disabled)', fontSize: '13px' }}>
            Non assigné
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${getStatusBadgeClass(ticket.status)}`}>
          {ticket.status}
        </span>
      </td>
      {/* Chevron : rien n'indique autrement que la ligne s'ouvre. */}
      <td style={{ color: 'var(--text-disabled)', textAlign: 'right' }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </td>
    </tr>
  );
}