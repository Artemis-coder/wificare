import type { Metadata } from 'next';
import './globals.css';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { navItemsFor } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import AppShell from './shell/app-shell';
import { PostHogIdentity } from './posthog-identity';

export const metadata: Metadata = {
  title: 'WifiCare - Dashboard',
  description: 'Plateforme de gestion pour propriétaires de Wi-Fi Zones',
  icons: {
    icon: '/logo-wificare.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  // La navigation suit le rôle : un compte qui n'a pas les droits ne doit pas
  // découvrir l'existence d'une page qu'il ne peut pas ouvrir.
  const navItems = navItemsFor(role);

  // Le badge est lu au rendu de la page : la cloche affiche donc le bon compte
  // dès le premier écran, sans appel client supplémentaire.
  const unreadCount = session
    ? await prisma.notification.count({
        where: { userId: session.user.id, readAt: null },
      })
    : 0;

  return (
    <html lang="fr">
      <body>
        {/* Le compte est connu ici, côté serveur : le rattacher à PostHog dès le
            rendu évite que tout ce qui précède — premier écran, première
            action — reste rattaché à une personne anonyme. */}
        {session && (
          <PostHogIdentity
            userId={session.user.id}
            role={session.user.role}
            phone={session.user.phone}
          />
        )}

        {/* L'écran de connexion est rendu sans coquille : il n'y a pas encore
            de navigation à proposer à quelqu'un qui n'est pas connecté. */}
        {!session ? (
          children
        ) : (
          <AppShell
            navItems={navItems}
            role={role}
            userName={session.user?.name ?? undefined}
            unreadCount={unreadCount}
          >
            {children}
          </AppShell>
        )}
      </body>
    </html>
  );
}