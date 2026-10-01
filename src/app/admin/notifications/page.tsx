import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { isStaff } from '@/lib/roles';
import { isWebPushConfigured } from '@/lib/web-push';
import PushSettings from '@/app/notifications/push-settings';
import { fetchBroadcastHistory, loadAudiences } from './actions';
import BroadcastComposer, {
  BroadcastHistory,
} from './broadcast-composer';

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
 * L'écran regroupe donc les deux besoins : composer un message pour une audience,
 * et équiper le poste pour être prévenu hors application.
 */
export default async function NotificationConsolePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isStaff(session.user.role)) {
    redirect('/');
  }

  const [subscriptions, audiences, broadcasts] = await Promise.all([
    prisma.webPushSubscription.findMany({
      where: { userId: session.user.id },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, label: true, lastSeenAt: true },
    }),
    loadAudiences(),
    fetchBroadcastHistory(),
  ]);

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Prévenez la plateforme, et equippez ce poste pour être prévenu.
          </p>
        </div>
      </div>

      <BroadcastComposer audiences={audiences} />

      <PushSettings
        vapidConfigured={isWebPushConfigured()}
        subscriptions={subscriptions.map((subscription) => ({
          id: subscription.id,
          label: subscription.label,
          lastSeenAt: subscription.lastSeenAt.toISOString(),
        }))}
      />

      <div style={{ marginTop: '24px' }}>
        <BroadcastHistory broadcasts={broadcasts} audienceLabel="la plateforme" />
      </div>
    </div>
  );
}