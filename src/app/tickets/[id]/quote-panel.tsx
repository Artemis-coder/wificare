/**
 * Devis d'une demande, en lecture.
 *
 * La régie voit le devis, ses lignes, son montant, son règlement et son
 * historique. Elle ne le tranche pas : le devis engage le client, et l'écran
 * ne propose donc aucun geste dessus.
 *
 * Le parcours de décision — accepter, refuser, régler — n'existe que dans
 * l'application mobile, où le client a son espace. Il avait existé ici pendant
 * quelques commits, le temps que le back-office affiche autre chose que des
 * compteurs : aucun compte client ne pouvait s'y connecter, donc aucun bouton
 * n'avait jamais pu s'afficher. La règle qui le valide reste dans
 * `lib/quotes.ts`, appelée par l'API REST que l'application consomme.
 */

type QuoteLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type QuoteView = {
  status: string;
  totalAmount: number;
  notes: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  lines: QuoteLine[];
  payment: {
    channel: string;
    operator: string | null;
    transactionRef: string | null;
    createdAt: string;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'En attente de décision du client',
  ACCEPTED: 'Accepté — à régler',
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
  CASH: 'espèces',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'virement bancaire',
};

const amount = (value: number) => `${value.toLocaleString('fr-FR')} FCFA`;

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

export default function QuotePanel({ quote }: { quote: QuoteView }) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', margin: 0 }}>Devis</h3>
        <span className={`badge ${STATUS_BADGE[quote.status] ?? 'badge-neutral'}`}>
          {STATUS_LABEL[quote.status] ?? quote.status}
        </span>
      </div>

      <div className="table-scroll" style={{ marginBottom: '16px' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Désignation</th>
            <th>Qté</th>
            <th>Prix unitaire</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line) => (
            <tr key={line.id}>
              <td data-label="Désignation">{line.description}</td>
              <td data-label="Qté">{line.quantity}</td>
              <td data-label="Prix unitaire">{amount(line.unitPrice)}</td>
              <td data-label="Total" style={{ fontWeight: 600 }}>{amount(line.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {quote.notes && (
        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: '14px' }}>
          {quote.notes}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border-default)' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Montant total</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand-700)' }}>
          {amount(quote.totalAmount)}
        </div>
      </div>

      {/* La route de règlement n'écrit que `transactionRef` ; `reference` reste
          vide pour un paiement Mobile Money. Lire les deux évite d'afficher
          « Encaissement direct » à côté d'une référence que le client a
          pourtant saisie. */}
      {quote.payment && (
        <div style={{ marginTop: '16px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--success-50)', border: '1px solid var(--success-100)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--success-600)', fontSize: '13px' }}>PAIEMENT ENREGISTRÉ PAR LE CLIENT</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {CHANNEL_LABEL[quote.payment.channel] ?? quote.payment.channel}
              {quote.payment.operator ? ` ${quote.payment.operator}` : ''}
              {quote.payment.transactionRef ? ` · Réf. ${quote.payment.transactionRef}` : ''}
              {date(quote.payment.createdAt) ? ` · le ${date(quote.payment.createdAt)}` : ''}
            </div>
          </div>
          <span className="badge badge-success">Confirmé</span>
        </div>
      )}

      <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {date(quote.sentAt) ? `Envoyé le ${date(quote.sentAt)}` : 'Devis en cours de rédaction'}
        {date(quote.acceptedAt) ? ` · accepté le ${date(quote.acceptedAt)}` : ''}
        {date(quote.rejectedAt) ? ` · refusé le ${date(quote.rejectedAt)}` : ''}
      </div>

      {/* Le devis engage le client : la régie le suit, elle ne le tranche pas.
          Dire cela évite qu'un chef de régie cherche ici un bouton qui ne peut
          pas y être. */}
      <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        Le client accepte, refuse et règle depuis l&apos;application mobile.
      </p>
    </div>
  );
}
