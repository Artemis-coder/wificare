import type { Metadata } from 'next';
import './globals.css';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { navItemsFor, ROLE_LABEL, type NavItem } from '@/lib/roles';

export const metadata: Metadata = {
  title: 'WiFi Zone Assist - Dashboard',
  description: 'Plateforme de gestion pour propriétaires de Wi-Fi Zones',
};

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><rect x="7" y="7" width="3" height="9" /><rect x="14" y="7" width="3" height="5" /></>,
  tickets: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  zones: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>,
  invoices: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  profile: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
};

function NavLink({ item }: { item: NavItem }) {
  return (
    <a href={item.href} className="nav-item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[item.icon]}
      </svg>
      {item.label}
    </a>
  );
}

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

  return (
    <html lang="fr">
      <body>
        {!session ? (
          children
        ) : (
          <div className="app-shell">
            <aside className="sidebar">
              <div className="sidebar-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-wificare.png" alt="" width={32} height={32} />
                WiFiCare
              </div>

              <nav>
                {navItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </nav>
            </aside>

            <main className="main-content">
              <header className="top-bar">
                <div className="search-bar">
                  {/* Search bar placeholder */}
                </div>
                <a href="/profile" className="user-profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {session.user?.name || 'Mon Compte'}
                    </span>
                    {role && (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {ROLE_LABEL[role]}
                      </span>
                    )}
                  </span>
                  <div style={{width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--brand-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 700, fontSize: '14px', boxShadow: '0 2px 6px rgba(37,99,235,0.3)'}}>
                    {session.user?.name?.[0] || 'U'}
                  </div>
                </a>
              </header>

              <div className="page-content">
                {children}
              </div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
