import type { Metadata } from 'next';
import './globals.css';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'WiFi Zone Assist - Dashboard',
  description: 'Plateforme de gestion pour propriétaires de Wi-Fi Zones',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="fr">
      <body>
        {!session ? (
          children
        ) : (
          <div className="app-shell">
            <aside className="sidebar">
              <div className="sidebar-logo">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                WiFiCare
              </div>
              
              <nav>
                <a href="/" className="nav-item">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="7" y="7" width="3" height="9"/><rect x="14" y="7" width="3" height="5"/></svg>
                  Tableau de bord
                </a>
                <a href="/tickets" className="nav-item">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  Tickets
                </a>
                <a href="/zones" className="nav-item">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                  Wi-Fi Zones
                </a>
                <a href="/profile" className="nav-item">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Mon Profil
                </a>
              </nav>
            </aside>
            
            <main className="main-content">
              <header className="top-bar">
                <div className="search-bar">
                  {/* Search bar placeholder */}
                </div>
                <a href="/profile" className="user-profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {session.user?.name || 'Mon Compte'}
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
