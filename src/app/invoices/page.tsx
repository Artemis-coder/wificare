import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { canUseBackoffice } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * Les mêmes libellés que le panneau de devis, pour qu'une facture lue dans la
 * liste et la même facture lue dans la demande se nomment pareil.
 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'En attente de décision',
  ACCEPTED: 'À régler',
  REJECTED: 'Refusé',
  PAID: 'Payé',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'badge-neutral',
  SENT: 'badge-warning',
  ACCEPTED: 'badge-brand',
  REJECTED: 'badge-danger',
  PAID: 'badge-success',
};

const CHANNEL_LABEL: Record<string, string> = {
  MOBILE_MONEY: 'Mobile Money',
  CASH: 'Espèces',
  BANK_TRANSFER: 'Virement',
};

export default async function InvoicesPage() {
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

  // La page listait tous les devis de la plateforme, sans distinction : un
  // compte client y lisait les montants et le nom des zones de tous les autres.
  // `lib/auth.ts` ferme désormais la porte à ce compte, et `GET
  // /api/quote-invoices` borne déjà sa liste. Cette portée est la seconde
  // couche, celle qui décrit ce que la page affiche.
  const scope: Prisma.QuoteInvoiceWhereInput =
    session.user.role === 'CLIENT'
      ? { ticket: { client: { userId: session.user.id } } }
      : session.user.role === 'TECHNICIAN'
        ? { ticket: { technicianId: session.user.id } }
        : {};

  const invoices = await prisma.quoteInvoice.findMany({
    where: scope,
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

  // Un devis en attente de décision n'attend pas un paiement : le client n'a
  // pas encore tranché, et compter son montant ici présentait une facture
  // comme due. Seul un devis accepté est une facture à encaisser.
  const totalPending = invoices
    .filter((inv) => inv.status === 'ACCEPTED')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const awaitingDecision = invoices.filter((inv) => inv.status === 'SENT').length;

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
            <div className="kpi-trend neutral">
              Devis acceptés, à encaisser
              {awaitingDecision > 0
                ? ` · ${awaitingDecision} en attente de décision`
                : ''}
            </div>
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
              <th>Client &amp; Wi-Fi Zone</th>
              <th>Montant Total</th>
              <th>Moyen de règlement</th>
              <th>Technicien</th>
              <th>Statut</th>
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
                      {CHANNEL_LABEL[inv.payment.channel] ?? inv.payment.channel}
                      {inv.payment.operator ? ` ${inv.payment.operator}` : ''}
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--text-disabled)' }}>Non renseigné</span>
                  )}
                </td>
                <td>
                  {inv.ticket.technician ? (
                    <span style={{ fontWeight: 600 }}>{inv.ticket.technician.name}</span>
                  ) : (
                    <span style={{ color: 'var(--text-disabled)', fontSize: '13px' }}>-</span>
                  )}
                </td>
                <td>
                  {/* Un refus n'est pas une attente : la pastille le disait
                      « en attente », comme un devis qui n'a pas encore été
                      lu par le client. */}
                  <span className={`badge ${STATUS_BADGE[inv.status] ?? 'badge-neutral'}`}>
                    <span className="badge-dot"></span>
                    {STATUS_LABEL[inv.status] ?? inv.status}
                  </span>
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
