import type { BroadcastStats } from '@/lib/broadcast';

/**
 * Chiffres de la campagne de messages.
 *
 * Trois questions, dans l'ordre où la régie se les pose : combien de messages
 * sont partis, combien restent en attente, et jusqu'où ils sont arrivés.
 *
 * Le dernier chiffre est le plus honnête des trois : « 6 destinataires, dont
 * 2 téléphones » distingue ce qui a été **diffusé** de ce qui a été
 * **reçu**. Rien ne permet d'aller plus loin — le push Android ne dit pas si
 * la notification a été lue, seulement qu'elle a été remise au système — et un
 * taux de lecture inventé serait le pire des chiffres.
 */
export default function BroadcastStatsPanel({ stats }: { stats: BroadcastStats }) {
  const coverage =
    stats.activeAccounts === 0
      ? 0
      : Math.round((stats.subscribedAccounts / stats.activeAccounts) * 100);

  return (
    <div className="data-table-wrapper" style={{ marginBottom: '24px' }}>
      <div className="data-table-header">
        <div>
          <h3 style={{ margin: 0 }}>Diffusion</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Ce qui est parti, ce qui reste en attente, ce qui a atteint un
            téléphone.
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1px',
          background: 'var(--border-default)',
        }}
      >
        <Tile
          value={stats.sent}
          label="Messages diffusés"
          hint={stats.sent === 0 ? 'Aucun envoi pour l\'instant' : `${stats.recipients} destinataires au total`}
        />
        <Tile
          value={stats.pending}
          label="En attente"
          hint={
            stats.nextScheduledAt
              ? `Prochain le ${formatDate(stats.nextScheduledAt)}`
              : 'Aucune programmation'
          }
          accent={stats.pending > 0}
        />
        <Tile
          value={stats.devicesMeasured ? stats.devices : '—'}
          label="Téléphones atteints"
          hint={
            stats.devicesMeasured
              ? `${stats.subscribedAccounts} comptes abonnés au push`
              : 'Non mesuré sur les campagnes déjà envoyées'
          }
        />
        <Tile
          value={`${coverage} %`}
          label="Couverture push"
          hint={`${stats.subscribedAccounts} comptes sur ${stats.activeAccounts} actifs`}
          accent={coverage < 100}
        />
        {stats.failed > 0 && (
          <Tile
            value={stats.failed}
            label="Envois échoués"
            hint="Voir le détail dans l’historique"
            danger
          />
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function Tile({
  value,
  label,
  hint,
  accent,
  danger,
}: {
  value: number | string;
  label: string;
  hint: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', padding: '18px 20px' }}>
      <div
        style={{
          fontSize: '28px',
          fontWeight: 700,
          lineHeight: 1.1,
          color: danger
            ? 'var(--error-600)'
            : accent
              ? 'var(--brand-600, var(--brand-500))'
              : undefined,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
        {hint}
      </div>
    </div>
  );
}