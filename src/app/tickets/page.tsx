import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import TicketRow from './ticket-row';
import { canUseBackoffice } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
        redirect('/login');
  }

  // Le back-office est réservé à la régie : un compte technicien ou
  // propriétaire n'y a pas d'espace et son compte n'y est pas connecté
  // (`lib/auth.ts` refuse sa connexion). Cette garde couvre le cas d'une
  // session antérieure à cette règle, ou d'un rôle changé depuis la
  // connexion — sans elle, la page resterait le seul endroit qui ne borne pas
  // ce qu'elle affiche.
  if (!canUseBackoffice(session.user.role)) {
    redirect('/login');
  }

  // Le back-office est réservé à la régie, et `lib/auth.ts` refuse la
  // connexion des autres rôles. Cette portée est la seconde couche : elle décrit
  // ce que la page est autorisée à afficher, pas seulement qui peut l'atteindre,
  // et survit à un assouplissement de la porte d'entrée sans avoir à être réécrite.
  const scope: Prisma.TicketWhereInput =
    session.user.role === 'CLIENT'
      ? { client: { userId: session.user.id } }
      : session.user.role === 'TECHNICIAN'
        ? { technicianId: session.user.id }
        : {};

  const tickets = await prisma.ticket.findMany({
    where: scope,
    orderBy: { createdAt: 'desc' },
    include: {
      client: true,
      wifiZone: true,
      technician: true,
    },
  });


  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h1>Gestion des tickets</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Suivez et gérez toutes les interventions sur vos Wi-Fi Zones.
          </p>
        </div>
        <Link href="/tickets/new" className="btn btn-primary btn-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouveau ticket
        </Link>
      </div>

      <div className="data-table-wrapper" style={{ marginTop: '24px' }}>
        <div className="data-table-header">
          <h3>Tous les tickets ({tickets.length})</h3>
          <div className="filter-row">
            <input
              type="search"
              className="field field-wide"
              placeholder="Rechercher..."
              aria-label="Rechercher un ticket"
            />
            <button className="btn btn-secondary btn-md">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filtrer
            </button>
          </div>
        </div>
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Date</th>
              <th>Client / Zone</th>
              <th>Problème</th>
              <th>Priorité</th>
              <th>Technicien</th>
              <th>Statut</th>
              {/* Colonne vide réservée au chevron : elle indique que la
                  ligne entière mène au détail. */}
              <th style={{ width: '40px' }}>
                <span className="sr-only">Ouvrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
            
            {tickets.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty" style={{ color: 'var(--text-secondary)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.5 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                  Aucun ticket trouvé.
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
