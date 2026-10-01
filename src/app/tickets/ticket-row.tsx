'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Priority, TicketStatus } from '@prisma/client';

import { getPriorityBadgeClass, getStatusBadgeClass } from './badges';

type RowTicket = {
  id: string;
  reference: string;
  createdAt: Date | string;
  type: string;
  priority: Priority;
  status: TicketStatus;
  client: { name: string | null };
  wifiZone: { name: string };
  technician: { name: string | null } | null;
};

/**
 * Ligne du tableau des demandes.
 *
 * Toute la ligne mène au détail, où se trouvent l'affectation d'un technicien
 * et le reste du traitement. La ligne affichait déjà un curseur cliquable sans
 * être reliée nulle part : cliquer ne faisait rien et la demande semblait
 * dépourvue de toute action.
 *
 * La référence est en outre un vrai lien, pour que la ligne reste atteignable
 * au clavier et annoncée comme un lien par les lecteurs d'écran.
 */
export default function TicketRow({ ticket }: { ticket: RowTicket }) {
  const router = useRouter();

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => router.push(`/tickets/${ticket.id}`)}
    >
      <td style={{ fontWeight: 600, color: 'var(--brand-600)' }}>
        <Link
          href={`/tickets/${ticket.id}`}
          onClick={(event) => event.stopPropagation()}
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {ticket.reference}
        </Link>
      </td>
      <td>{new Date(ticket.createdAt).toLocaleDateString('fr-FR')}</td>
      <td>
        <div style={{ fontWeight: 500 }}>{ticket.wifiZone.name}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {ticket.client.name}
        </div>
      </td>
      <td>{ticket.type}</td>
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
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'var(--brand-100)',
                color: 'var(--brand-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 600,
              }}
            >
              {ticket.technician.name?.[0] || 'T'}
            </div>
            {ticket.technician.name}
          </div>
        ) : (
          <span style={{ color: 'var(--text-disabled)' }}>Non affecté</span>
        )}
      </td>
      <td>
        <span className={`badge ${getStatusBadgeClass(ticket.status)}`}>
          {ticket.status}
        </span>
      </td>
    </tr>
  );
}