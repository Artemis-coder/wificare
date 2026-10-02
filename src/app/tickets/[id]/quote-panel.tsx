'use client';

import { useState, useTransition } from 'react';

import { decideQuoteAction, payQuoteAction } from '../actions';

/**
 * Devis d'une demande : lecture, décision, règlement.
 *
 * Le back-office affichait le devis — lignes, total, montant — mais n'offrait
 * rien pour le trancher. Un client connecté depuis un navigateur pouvait lire
 * un devis en attente et ne pouvait ni l'accepter, ni le refuser, ni le
 * régler : le parcours existait dans l'application mobile et nowhere else. Les
 * endpoints existaient aussi, sans appelant.
 *
 * Les règles ne sont pas ici : `decideQuoteAction` et `payQuoteAction` appellent
 * les fonctions partagées avec l'API REST. L'écran ne fait que proposer les
 * gestes ; c'est le serveur qui décide de ce qui est permis.
 */

type QuoteLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

type Payment = {
  channel: string;
  operator: string | null;
  transactionRef: string | null;
  reference: string | null;
  createdAt: string;
} | null;

export type QuoteView = {
  id: string;
  ticketId: string;
  status: string;
  totalAmount: number;
  notes: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  lines: QuoteLine[];
  payment: Payment;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'En attente de votre décision',
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
  CASH: 'Espèces, à la main',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement bancaire',
};

const OPERATORS = ['WAVE', 'ORANGE', 'MTN'] as const;

const amount = (value: number) => `${value.toLocaleString('fr-FR')} FCFA`;

/** Champs de formulaire : le projet n'a pas de classe pour eux, les
 *  formulaires existants portent leurs dimensions en style inline. */
const FIELD = { width: '100%', padding: '8px 10px', fontSize: '14px' } as const;

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

export default function QuotePanel({
  quote,
  isClient,
}: {
  quote: QuoteView;
  /** Le lecteur est-il le client concerné ? Seul lui peut trancher. */
  isClient: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState('MOBILE_MONEY');
  const [isPending, startTransition] = useTransition();

  const label = STATUS_LABEL[quote.status] ?? quote.status;
  const badge = STATUS_BADGE[quote.status] ?? 'badge-neutral';

  function decide(decision: 'ACCEPT' | 'REJECT') {
    setError(null);

    startTransition(async () => {
      try {
        await decideQuoteAction(quote.id, quote.ticketId, decision);
        window.location.reload();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Action impossible.');
      }
    });
  }

  function pay(formData: FormData) {
    setError(null);

    startTransition(async () => {
      try {
        await payQuoteAction(quote.ticketId, formData);
        window.location.reload();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Paiement impossible.');
      }
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', margin: 0 }}>Devis</h3>
        <span className={`badge ${badge}`}>{label}</span>
      </div>

      <table className="data-table" style={{ marginBottom: '16px' }}>
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
              <td>{line.description}</td>
              <td>{line.quantity}</td>
              <td>{amount(line.unitPrice)}</td>
              <td style={{ fontWeight: 600 }}>{amount(line.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

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

      {/* Un devis payé est un contrat exécuté : on n'y touche plus. Un devis
          envoyé est le seul qui attende une décision. */}
      {quote.payment && (
        <div style={{ marginTop: '16px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--success-50)', border: '1px solid var(--success-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--success-600)', fontSize: '13px' }}>PAIEMENT ENREGISTRÉ</div>
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

      {!quote.payment && (
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {date(quote.sentAt) ? `Envoyé le ${date(quote.sentAt)}` : 'Devis en cours de rédaction'}
          {date(quote.acceptedAt) ? ` · accepté le ${date(quote.acceptedAt)}` : ''}
          {date(quote.rejectedAt) ? ` · refusé le ${date(quote.rejectedAt)}` : ''}
        </div>
      )}

      {error && (
        <div role="alert" style={{ marginTop: '16px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--error-50)', border: '1px solid var(--error-100)', color: 'var(--error-600)', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Un client qui n'est pas le concerné voit le devis, mais ne peut pas
          le trancher : le serveur le refuserait de toute façon, et proposer le
          bouton l'exposerait à un échec. */}
      {!isClient && !quote.payment && (
        <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Seul le client concerné peut accepter ou refuser ce devis.
        </p>
      )}

      {isClient && quote.status === 'SENT' && (
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-default)' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: 0 }}>
            Acceptez pour autoriser le technicien à intervenir, ou refusez s&apos;est
            le montant qui ne convient pas. Régler n&apos;est pas la même chose
            qu&apos;accepter : vous pouvez refuser en gardant votre argent.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-primary btn-md"
              disabled={isPending}
              onClick={() => decide('ACCEPT')}
            >
              {isPending ? 'En cours…' : 'Accepter le devis'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              disabled={isPending}
              onClick={() => decide('REJECT')}
            >
              Refuser
            </button>
          </div>
        </div>
      )}

      {isClient && quote.status === 'ACCEPTED' && (
        <form
          action={pay}
          style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-default)' }}
        >
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: 0 }}>
            Devis accepté. Vous pouvez régler maintenant : le technicien est
            prévenu et peut lancer la réparation.
          </p>

          <label className="label" htmlFor="quote-channel">Moyen de paiement</label>
          <select
            id="quote-channel"
            name="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            style={{ ...FIELD, marginBottom: '12px' }}
          >
            {Object.entries(CHANNEL_LABEL).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>

          {channel === 'MOBILE_MONEY' && (
            <>
              <label className="label" htmlFor="quote-operator">Opérateur</label>
              <select id="quote-operator" name="operator" style={{ ...FIELD, marginBottom: '12px' }}>
                {OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>{operator}</option>
                ))}
              </select>
            </>
          )}

          {/* La référence n'a de sens que là où une transaction la produit :
              Wave, Orange et MTN en donnent une, un versement en espèces n'en
              donne pas. La demander quand même ouvrirait un champ que personne
              ne sait remplir. */}
          {channel !== 'CASH' && (
            <>
              <label className="label" htmlFor="quote-ref">
                Référence de la transaction
              </label>
              <input
                id="quote-ref"
                name="transactionRef"
                style={FIELD}
                placeholder={channel === 'MOBILE_MONEY' ? 'Ex. TRX-4821930' : 'Référence du virement'}
              />
            </>
          )}

          <button type="submit" className="btn btn-primary btn-md" disabled={isPending} style={{ marginTop: '16px' }}>
            {isPending ? 'Enregistrement…' : `Payer ${amount(quote.totalAmount)}`}
          </button>
        </form>
      )}

      {isClient && quote.status === 'REJECTED' && !quote.payment && (
        <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Vous avez refusé ce devis. Le technicien peut en proposer un autre.
        </p>
      )}
    </div>
  );
}
