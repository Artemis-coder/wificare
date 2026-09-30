import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  const invoices = await prisma.quoteInvoice.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      ticket: {
        include: {
          client: true,
          wifiZone: true,
          technician: true,
        },
      },
      payment: true,
    },
  });

  const totalPaid = invoices
    .filter((inv) => inv.status === 'PAID')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const totalPending = invoices
    .filter((inv) => inv.status !== 'PAID')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Factures & Encaissements</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Suivez les paiements effectués, les déclarations des techniciens et les encaissements.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dashboard-grid" style={{ marginTop: '24px' }}>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">Total Déjà Encaisse</div>
            <div className="kpi-icon-wrapper success">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success-600)' }}>
            {totalPaid.toLocaleString('fr-FR')} FCFA
          </div>
          <div className="kpi-trend positive">Paiements validés</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">Règlements en attente</div>
            <div className="kpi-icon-wrapper warning">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--warning-600)' }}>
            {totalPending.toLocaleString('fr-FR')} FCFA
          </div>
          <div className="kpi-trend neutral">En attente de règlement client</div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="data-table-wrapper" style={{ marginTop: '24px' }}>
        <div className="data-table-header">
          <h3>Toutes les Factures ({invoices.length})</h3>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Ticket Associé</th>
              <th>Client & Wi-Fi Zone</th>
              <th>Montant Total</th>
              <th>Mode de Règlement</th>
              <th>Déclaration Technicien</th>
              <th>Statut Facture</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <Link href={`/tickets/${inv.ticket.id}`} style={{ fontWeight: 700, color: 'var(--brand-600)', textDecoration: 'none' }}>
                    {inv.ticket.reference}
                  </Link>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{inv.ticket.type}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{inv.ticket.wifiZone.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{inv.ticket.client.name}</div>
                </td>
                <td style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>
                  {inv.totalAmount.toLocaleString('fr-FR')} FCFA
                </td>
                <td>
                  {inv.payment ? (
                    <span className="badge badge-brand">
                      {inv.payment.channel === 'MOBILE_MONEY' ? '📱 Mobile Money' : inv.payment.channel === 'CASH' ? '💵 Espèces' : '🏦 Virement'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--text-disabled)' }}>Non renseigné</span>
                  )}
                </td>
                <td>
                  {inv.ticket.technician ? (
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ fontWeight: 600 }}>{inv.ticket.technician.name}</span>
                      {inv.payment && <div style={{ fontSize: '11px', color: 'var(--success-600)' }}>✓ Déclaré reçu</div>}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-disabled)', fontSize: '13px' }}>-</span>
                  )}
                </td>
                <td>
                  {inv.status === 'PAID' ? (
                    <span className="badge badge-success">
                      <span className="badge-dot"></span>
                      PAYÉ
                    </span>
                  ) : (
                    <span className="badge badge-warning">
                      <span className="badge-dot"></span>
                      EN ATTENTE
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                  Aucune facture enregistrée pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
