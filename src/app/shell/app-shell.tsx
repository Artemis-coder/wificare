'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ROLE_LABEL, isStaff, type AppRole, type NavItem } from '@/lib/roles';
import NotificationBell from '../notifications/notification-bell';

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><rect x="7" y="7" width="3" height="9" /><rect x="14" y="7" width="3" height="5" /></>,
  tickets: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  reviews: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  zones: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>,
  invoices: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  profile: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
};

/**
 * Coquille de l'application : navigation, barre supérieure, contenu.
 *
 * Ce composant est client alors que tout ce qu'il contient était rendu côté
 * serveur. La raison est unique : sur téléphone, la navigation de 260 px ne
 * laisse plus de place à la page, elle devient un tiroir. Un tiroir a besoin
 * d'un état d'ouverture, donc d'un composant client.
 *
 * Ce qui reste côté serveur — la session, la liste des entrées de navigation
 * selon le rôle, le compteur de notifications lu en base — est calculé dans
 * `app/layout.tsx` et transmis ici en propriétés. Le client ne recharge rien :
 * il ne fait que refermer le tiroir.
 */
export default function AppShell({
  navItems,
  role,
  userName,
  unreadCount,
  children,
}: {
  navItems: NavItem[];
  role: AppRole | undefined;
  userName: string | undefined;
  unreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Le tiroir est ouvert « pour la page qu'il a été ouvert sur » plutôt que
  // simplement « ouvert ». Naviguer change la route, donc l'état ne décrit
  // plus la page courante et le tiroir se referme de lui-même : pas d'effet
  // pour le faire, et pas de rendu intermédiaire où le tiroir reste ouvert
  // par-dessus l'écran que l'on vient d'ouvrir.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const navOpen = openedOn === pathname;

  const closeNav = useCallback(() => setOpenedOn(null), []);
  const openNav = useCallback(() => setOpenedOn(pathname), [pathname]);

  // Le tiroir est une surface modale : il se referme à la touche Échap et
  // verrouille le défilement de la page en dessous, sinon le geste de défiler
  // fait défiler le tiroir et la page à la fois.
  useEffect(() => {
    if (!navOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenedOn(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [navOpen]);

  return (
    <div className="app-shell">
      {navOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Fermer la navigation"
          onClick={closeNav}
        />
      )}

      <aside className="sidebar" data-open={navOpen}>
        <div className="sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-wificare.png" alt="" width={32} height={32} />
          WiFiCare
          <button
            type="button"
            className="sidebar-close"
            aria-label="Fermer la navigation"
            onClick={closeNav}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${isActive(pathname, item.href) ? ' active' : ''}`}
              // Une entrée de navigation n'a rien d'une page entière : revenir
              // en arrière après l'avoir suivie ferait repasser par la liste.
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              onClick={closeNav}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS[item.icon]}
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Ouvrir la navigation"
            aria-expanded={navOpen}
            onClick={openNav}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="search-bar" />

          <div className="top-bar-actions">
            {/* La cloche n'est montée que pour la régie : un client n'a pas
                d'espace web, et la notification concernerait un travail qui
                n'est pas le sien. Le composant est client, la session reste
                côté serveur : il lit la sienne par server action. */}
            {isStaff(role) && (
              <NotificationBell initialUnreadCount={unreadCount} />
            )}
            <Link href="/profile" className="user-profile">
              <span className="user-profile-identity">
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {userName || 'Mon Compte'}
                </span>
                {role && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {ROLE_LABEL[role]}
                  </span>
                )}
              </span>
              <span className="user-avatar">{userName?.[0] || 'U'}</span>
            </Link>
          </div>
        </header>

        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

/**
 * Une entrée est active si elle mène à la page courante, ou à l'une de ses
 * sections. `/` est traitée à part : c'est le préfixe de toutes les routes, et
 * elle serait sinon marquée active partout.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';

  return pathname === href || pathname.startsWith(`${href}/`);
}