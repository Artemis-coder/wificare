import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { isStaff } from '@/lib/roles';
import { isPushConfigured } from '@/lib/push';
import { isWebPushConfigured } from '@/lib/web-push';
import PushSettings from '@/app/notifications/push-settings';
import {
  fetchBroadcastHistory,
  fetchBroadcastStats,
  fetchScheduledBroadcasts,
  loadAudiences,
} from './actions';
import AndroidPushStatus from './android-push-status';
import BroadcastList from './broadcast-list';
import BroadcastStatsPanel from './broadcast-stats';
import BroadcastComposer from './broadcast-composer';

export const dynamic = 'force-dynamic';

/**
 * Console de notification de la régie.
 *
 * Le cycle de vie d'une demande ne couvre qu'une partie de ce qu'il faut
 * annoncer : une coupure réseau sur plusieurs zones, une maintenance planifiée,
 * un incident général. Ces messages n'ont ni demande ni technicien associé, et
 * n'arrivaient qu'à passer par la console Firebase — une dépendance externe pour
 * un geste qui relève du back-office.
 *
 * L'écran regroupe le geste et sa suite : composer, envoyer ou programmer,
 * savoir ce qui est parti et ce qui reste en attente, et équiper le poste pour
 * être prévenu hors application. Réservé à l'encadrement : c'est un canal qui
 * fait sonner le téléphone de toute la plateforme.
 */
export default async function NotificationConsolePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isStaff(session.user.role)) {
    redirect('/');
  }

  const [subscriptions, audiences, broadcasts, scheduled, stats] = await Promise.all([
    prisma.webPushSubscription.findMany({
      where: { userId: session.user.id },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, label: true, lastSeenAt: true },
    }),
    loadAudiences(),
    fetchBroadcastHistory(),
    fetchScheduledBroadcasts(),
    fetchBroadcastStats(),
  ]);

  // L'audience « tout le monde » compte déjà les comptes actifs : elle est la
  // référence pour dire sur combien de téléphones un message peut sonner.
  const everyone = audiences.find((audience) => audience.value === 'ALL');
  const activeAccounts = everyone?.count ?? 0;
  const subscribedAccounts = everyone?.devices ?? 0;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Prévenez la plateforme, et équipez ce poste pour être prévenu.
          </p>
        </div>
      </div>

      {stats && <BroadcastStatsPanel stats={stats} />}

      <BroadcastComposer audiences={audiences} />

      <AndroidPushStatus
        configured={isPushConfigured()}
        subscribedAccounts={subscribedAccounts}
        totalAccounts={activeAccounts}
      />

      <BroadcastList scheduled={scheduled} history={broadcasts} />

      <div style={{ marginTop: '24px' }}>
        <PushSettings
          vapidConfigured={isWebPushConfigured()}
          subscriptions={subscriptions.map((subscription) => ({
            id: subscription.id,
            label: subscription.label,
            lastSeenAt: subscription.lastSeenAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}