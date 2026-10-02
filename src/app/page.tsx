import { prisma } from '@/lib/prisma';
import { TicketStatus, Priority } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { canUseBackoffice, isSuperAdmin } from '@/lib/roles';
import DashboardTicketRow from './dashboard-ticket-row';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
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

  const canManage = isSuperAdmin(session.user.role);

  // Parc exploité et zones en attente de validation : une zone déclarée par un
  // propriétaire n'existe pas encore pour la plateforme, et la confondre avec
  // une zone validée rendrait le parc plus grand qu'il ne l'est.
  const activeZonesCount = await prisma.wifiZone.count({
    where: { status: 'ACTIVE' },
  });

  const pendingZonesCount = await prisma.wifiZone.count({
    where: { status: 'PENDING' },
  });

  // Open Maintenance Tickets (Panne / Lenteur)
  const openTicketsCount = await prisma.ticket.count({
    where: {
      type: { notIn: ['Installation Antenne', 'Nouveau Routeur', 'Extension Couverture'] },
      status: { notIn: [TicketStatus.CLOSED, TicketStatus.CANCELED, TicketStatus.COMPLETED] },
    },
  });

  // Installation & Equipment Requests
  const installationRequestsCount = await prisma.ticket.count({
    where: {
      type: { in: ['Installation Antenne', 'Nouveau Routeur', 'Extension Couverture', 'Nouvelle Installation'] },
      status: { notIn: [TicketStatus.CLOSED, TicketStatus.CANCELED] },
    },
  });

  // Urgent Interventions
  const urgentInterventions = await prisma.ticket.count({
    where: {
      priority: Priority.URGENT,
      status: { notIn: [TicketStatus.CLOSED, TicketStatus.CANCELED] },
    },
  });

  // Pending Payments
  const pendingInvoices = await prisma.quoteInvoice.findMany({
    where: { status: 'SENT' },
  });
  const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Nombre de comptes enregistrés : l'indicateur que la régie suit pour juger
  // s'il faut recruter un technicien.
  const totalUsersCount = await prisma.user.count();

  // Recent tickets/requests
  const recentTickets = await prisma.ticket.findMany({
    take: 6,
    orderBy: { createdAt: 'desc' },
    include: {
      client: true,
      wifiZone: true,
      technician: true,
    },
  });

  return (
    <div>
      {/* Hero Welcome Banner */}
      <div className="hero-banner">
        <div className="hero-banner-text">
          <span className="hero-banner-eyebrow">
            Portail Super Administration WiFiCare
          </span>
          <h1 className="hero-banner-title">
            Bienvenue, {session.user?.name || 'Administrateur'} 👋
          </h1>
          <p className="hero-banner-lead">
            Supervisez le parc Wi-Fi, validez les zones déclarées et suivez les interventions en temps réel.
          </p>
        </div>
        <div className="hero-banner-actions">
          <Link href="/tickets/new" className="btn btn-lg btn-on-dark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouvelle demande / Ticket
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="dashboard-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">Wi-Fi Zones Actives</div>
            <div className="kpi-icon-wrapper blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </div>
          </div>
          <div className="kpi-value">{activeZonesCount}</div>
          <div className="kpi-trend positive">
            {pendingZonesCount > 0 ? (
              <Link
                href="/zones?status=PENDING"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {pendingZonesCount} zone(s) en attente de validation
              </Link>
            ) : (
              '100% de disponibilité du parc'
            )}
          </div>
        </div>

        {canManage && (
          <div className="kpi-card">
            <div className="kpi-header">
              <div className="kpi-label">Comptes sur la plateforme</div>
              <div className="kpi-icon-wrapper purple">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
            </div>
            <div className="kpi-value">{totalUsersCount}</div>
            <div className="kpi-trend neutral">
              <Link
                href="/admin/utilisateurs"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                Voir l&apos;annuaire des comptes
              </Link>
            </div>
          </div>
        )}

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">Demandes d&apos;Installation</div>
            <div className="kpi-icon-wrapper purple">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </div>
          </div>
          <div className="kpi-value">{installationRequestsCount}</div>
          <div className="kpi-trend neutral">
            Antennes & Nouveaux Routeurs
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">Pannes & Incidents</div>
            <div className="kpi-icon-wrapper warning">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
          </div>
          <div className="kpi-value">{openTicketsCount}</div>
          <div className="kpi-trend negative">
            dont {urgentInterventions} urgente(s)
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">Factures en attente</div>
            <div className="kpi-icon-wrapper success">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>
          <div className="kpi-value" style={{ fontSize: '24px' }}>{pendingAmount.toLocaleString('fr-FR')} FCFA</div>
          <div className="kpi-trend neutral">
            {pendingInvoices.length} devis/facture(s) émis
          </div>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <h3 style={{ marginBottom: '16px' }}>Actions Rapides</h3>
      <div className="actions-grid">
        <Link href="/tickets/new" className="action-card">
          <div className="action-icon" style={{ backgroundColor: 'var(--accent-purple-light)', color: 'var(--accent-purple)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>Demande d&apos;Installation</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Nouvelle antenne, routeur ou extension de couverture</div>
          </div>
        </Link>

        <Link href="/tickets/new" className="action-card">
          <div className="action-icon" style={{ backgroundColor: 'var(--error-50)', color: 'var(--error-600)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>Signaler un Dysfonctionnement</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Panne totale, lenteur ou coupure de signal</div>
          </div>
        </Link>

        <Link href={canManage ? '/admin/zones' : '/zones'} className="action-card">
          <div className="action-icon" style={{ backgroundColor: 'var(--brand-50)', color: 'var(--brand-600)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>{canManage ? 'Ajouter une Wi-Fi Zone' : 'Déclarer une Wi-Fi Zone'}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {canManage
                ? 'Rattacher un nouvel emplacement à un propriétaire'
                : 'Enregistrer un nouvel emplacement ou client'}
            </div>
          </div>
        </Link>
      </div>

      {/* Main Table: Demandes & Interventions */}
      <div className="data-table-wrapper" style={{ marginTop: '32px' }}>
        <div className="data-table-header">
          <div className="page-header-text">
            <h3 style={{ margin: 0 }}>Dernières Demandes & Interventions</h3>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Installations d&apos;antennes, équipements et dépannages urgents</span>
          </div>
          <Link href="/tickets" className="btn btn-secondary btn-md">
            Voir tout ({recentTickets.length})
          </Link>
        </div>

        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Client / Emplacement</th>
              <th>Type de demande</th>
              <th>Priorité</th>
              <th>Technicien</th>
              <th>Statut</th>
              {/* Colonne vide réservée au chevron : elle indique que la ligne
                  entière mène au détail, où se trouvent les actions. */}
              <th style={{ width: '40px' }}>
                <span className="sr-only">Ouvrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {recentTickets.map((ticket) => (
              <DashboardTicketRow key={ticket.id} ticket={ticket} />
            ))}

            {recentTickets.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty" style={{ color: 'var(--text-secondary)' }}>
                  Aucune demande en cours.
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
