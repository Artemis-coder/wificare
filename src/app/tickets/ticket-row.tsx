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
 *
 * Chaque cellule porte son intitulé de colonne dans `data-label`. Sur téléphone,
 * le tableau bascule en cartes empilées et c'est cet attribut qui devient le
 * libellé affiché à gauche de la valeur.
 */
export default function TicketRow({ ticket }: { ticket: RowTicket }) {
  const router = useRouter();

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => router.push(`/tickets/${ticket.id}`)}
    >
      <td data-label="Référence" style={{ fontWeight: 600, color: 'var(--brand-600)' }}>
        <Link
          href={`/tickets/${ticket.id}`}
          onClick={(event) => event.stopPropagation()}
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {ticket.reference}
        </Link>
      </td>
      <td data-label="Date">{new Date(ticket.createdAt).toLocaleDateString('fr-FR')}</td>
      <td data-label="Client / Zone">
        <div style={{ fontWeight: 500 }}>{ticket.wifiZone.name}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {ticket.client.name}
        </div>
      </td>
      <td data-label="Problème">{ticket.type}</td>
      <td data-label="Priorité">
        <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>
          {ticket.priority}
        </span>
      </td>
      <td data-label="Technicien">
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
      <td data-label="Statut">
        <span className={`badge ${getStatusBadgeClass(ticket.status)}`}>
          {ticket.status}
        </span>
      </td>
      {/* Chevron : sans lui, rien n'indique que la ligne s'ouvre. Le
          parcours se faisait à l'aveugle, la ligne paraissant décorative. */}
      <td className="cell-actions" style={{ color: 'var(--text-disabled)', textAlign: 'right' }}>
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