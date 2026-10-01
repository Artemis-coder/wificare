import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { isStaff } from '@/lib/roles';
import { isWebPushConfigured } from '@/lib/web-push';
import PushSettings from '@/app/notifications/push-settings';

export const dynamic = 'force-dynamic';

/**
 * Réglages de notification du poste, pour la régie.
 *
 * Le back-office ne vit que dans un navigateur : sans abonnement Web Push, une
 * demande qui attend une répartition n'est visible qu'au chargement de la
 * page. Cet écran est donc là où l'on active le canal, où l'on voit quels postes
 * sont abonnés, et d'où l'on s'envoie une notification d'essai.
 */
export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isStaff(session.user.role)) {
    redirect('/');
  }

  const params = await searchParams;
  const sent = params.sent === '1';

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, label: true, lastSeenAt: true },
  });

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Soyez prévenu sur ce poste, même le back-office fermé.
          </p>
        </div>
      </div>

      <PushSettings
        vapidConfigured={isWebPushConfigured()}
        subscriptions={subscriptions.map((subscription) => ({
          id: subscription.id,
          label: subscription.label,
          lastSeenAt: subscription.lastSeenAt.toISOString(),
        }))}
        testSent={sent}
      />
    </div>
  );
}