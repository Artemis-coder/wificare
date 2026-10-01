'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type WebNotification,
} from './actions';

/** Intervalle de rafraîchissement du compteur, en millisecondes. */
const POLL_INTERVAL_MS = 30_000;

/** Age à partir duquel une notification est qualifiée de « récente ». */
const RECENT_MS = 60_000;

/**
 * Cloche de notifications du back-office.
 *
 * Le backend écrivait déjà les notifications pour la régie, mais rien ne les
 * affichait dans le back-office : la seule façon de savoir qu'une demande
 * attendait était de recharger la page. Le compteur est donc relu toutes les
 * 30 secondes, comme le fait l'application mobile.
 *
 * Le rafraîchissement est déclenché, pas permanent : le `setInterval` n'existe
 * que tant que la cloche est montée, et il est annulé au démontage.
 */
export default function NotificationBell({
  initialUnreadCount,
}: {
  /** Nombre de non-lus lu en base par le serveur, au rendu de la page. */
  initialUnreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<WebNotification[]>([]);
  const [justArrived, setJustArrived] = useState(false);

  // Sert à détecter la fermeture du panneau au clic dehors.
  const rootRef = useRef<HTMLDivElement>(null);

  // Le compteur est relu séparément de la liste : le rafraîchissement périodique
  // ne doit pas rouvrir le panneau ni réécrire la liste sous les yeux du lecteur.
  // Le serveur a déjà fourni le compteur au premier rendu, il n'est donc pas
  // relu à l'ouverture : seul l'intervalle s'en charge.
  const latestUnread = useRef(initialUnreadCount);

  const refreshCount = useCallback(async () => {
    try {
      const feed = await fetchNotifications(1);

      // Une notification qui vient d'arriver attire l'attention sans exiger
      // d'ouvrir le panneau : sans elle, le compteur change en silence.
      if (
        latestUnread.current === 0 &&
        feed.unreadCount > 0 &&
        feed.items[0] &&
        Date.now() - new Date(feed.items[0].createdAt).getTime() < RECENT_MS
      ) {
        setJustArrived(true);
        window.setTimeout(() => setJustArrived(false), 4000);
      }

      latestUnread.current = feed.unreadCount;
      setUnreadCount(feed.unreadCount);
    } catch {
      // Un compteur qui échoue ne doit pas casser la barre supérieure : la
      // cloche reste simplement muette jusqu'au prochain essai.
    }
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const feed = await fetchNotifications(20);
      latestUnread.current = feed.unreadCount;
      setUnreadCount(feed.unreadCount);
      setItems(feed.items);
    } catch {
      // Idem : le panneau reste vide plutôt que de faire échouer le rendu.
    }
  }, []);

  // Seul lintervalle relit le compteur : le premier rendu est servi par le
  // serveur, et la liste est demandée à l'ouverture du panneau. L'effet ne fait
  // donc que planifier la relève, pas la déclencher pendant le rendu.
  useEffect(() => {
    const timer = window.setInterval(refreshCount, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [refreshCount]);

  // Le clic dehors ferme le panneau : sinon il reste ouvert par-dessus la page
  // après avoir déplacé le regard.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);

    if (next) await refreshList();
  }

  async function handleOpen(notification: WebNotification) {
    if (!notification.readAt) {
      try {
        await markNotificationRead(notification.id);
      } catch {
        // La navigation reste possible même si le marquage échoue.
      }
    }

    setOpen(false);
    router.push(notification.ticketId ? `/tickets/${notification.ticketId}` : '/');
    void refreshCount();
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    await refreshList();
    void refreshCount();
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="notif-bell"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} non lue${unreadCount > 1 ? 's' : ''})`
            : 'Notifications'
        }
        style={
          justArrived
            ? { borderColor: 'var(--error-600)', color: 'var(--error-600)' }
            : undefined
        }
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-header">
            <strong style={{ fontSize: '14px' }}>Notifications</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--brand-600)',
                  padding: 0,
                }}
              >
                Tout lire
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="notif-empty">Aucune notification pour le moment.</p>
          ) : (
            items.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`notif-item ${notification.readAt ? '' : 'notif-item-unread'}`}
                onClick={() => handleOpen(notification)}
              >
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{notification.title}</div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    marginTop: '2px',
                  }}
                >
                  {notification.body}
                </div>
                <div
                  style={{ fontSize: '11px', color: 'var(--text-disabled)', marginTop: '4px' }}
                >
                  {new Date(notification.createdAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}