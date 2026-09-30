import { prisma } from '@/lib/prisma';
import { TicketStatus, Priority } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }
  // Fetch data directly from Prisma in this Server Component
  const openTickets = await prisma.ticket.count({
    where: {
      status: {
        notIn: [TicketStatus.CLOSED, TicketStatus.CANCELED, TicketStatus.COMPLETED],
      },
    },
  });

  const urgentInterventions = await prisma.ticket.count({
    where: {
      priority: Priority.URGENT,
      status: {
        notIn: [TicketStatus.CLOSED, TicketStatus.CANCELED],
      },
    },
  });

  // Calculate pending payments
  const pendingInvoices = await prisma.quoteInvoice.findMany({
    where: {
      status: 'SENT', // Or any status representing pending payment
    },
  });
  
  const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Recent interventions (tickets)
  const recentTickets = await prisma.ticket.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      client: true,
      wifiZone: true,
      technician: true,
    },
  });

  const getStatusBadgeClass = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.NEW:
      case TicketStatus.TO_VERIFY:
        return 'badge-neutral';
      case TicketStatus.ASSIGNED:
      case TicketStatus.CONFIRMED:
      case TicketStatus.EN_ROUTE:
        return 'badge-brand';
      case TicketStatus.DIAGNOSING:
      case TicketStatus.PENDING_QUOTE:
      case TicketStatus.REPAIRING:
        return 'badge-warning';
      case TicketStatus.COMPLETED:
      case TicketStatus.CLOSED:
        return 'badge-success';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Vue d'ensemble</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Suivez l'activité de vos Wi-Fi Zones en temps réel.
          </p>
        </div>
        <button className="btn btn-primary btn-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouveau ticket
        </button>
      </div>

      <div className="dashboard-grid">
        <div className="kpi-card">
          <div className="kpi-label">Tickets ouverts</div>
          <div className="kpi-value">{openTickets}</div>
          <div className="kpi-trend neutral">
            Total en cours
          </div>
        </div>
        
        <div className="kpi-card">
          <div className="kpi-label">Interventions urgentes</div>
          <div className="kpi-value" style={{ color: 'var(--error-600)' }}>{urgentInterventions}</div>
          <div className="kpi-trend negative">
            À traiter immédiatement
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Interventions du jour</div>
          <div className="kpi-value">{recentTickets.length}</div>
          <div className="kpi-trend positive">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Récentes
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Paiements en attente</div>
          <div className="kpi-value">{pendingAmount.toLocaleString('fr-FR')} FCFA</div>
          <div className="kpi-trend neutral">
            Sur {pendingInvoices.length} factures
          </div>
        </div>
      </div>

      <div className="data-table-wrapper">
        <div className="data-table-header">
          <h3>Interventions récentes</h3>
          <button className="btn btn-secondary btn-md">Voir tout</button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Client / Zone</th>
              <th>Problème</th>
              <th>Technicien</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {recentTickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>{ticket.reference}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{ticket.wifiZone.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ticket.client.name}</div>
                </td>
                <td>{ticket.type}</td>
                <td>{ticket.technician?.name || 'Non affecté'}</td>
                <td><span className={`badge ${getStatusBadgeClass(ticket.status)}`}>{ticket.status}</span></td>
              </tr>
            ))}
            
            {recentTickets.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px' }}>
                  Aucune intervention récente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
