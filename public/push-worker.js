/*
 * Service worker de notification du back-office.
 *
 * Écrit en JavaScript brut, sans Firebase : c'est ce qui permet au back-office
 * de recevoir des notifications hors application sans passer par la console
 * Firebase. Le protocole Web Push suffit — le navigateur expose un service de
 * push, le serveur chiffre avec les clés de l'abonnement.
 *
 * Il affiche la notification et, au clic, ramène vers la demande concernée.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Un payload illisible ne doit pas priver la notification : le titre et le
    // texte restent affichés, seule la demande liée est perdue.
    payload = { title: event.data ? event.data.text() : 'WiFiCare' };
  }

  const title = payload.title || 'WiFiCare';
  const options = {
    body: payload.body || '',
    // Réutilise la même balise pour deux notifications de la même demande :
    // l'espacement ne s'empile pas, il remplace la précédente.
    tag: payload.ticketId || 'wificare',
    icon: '/icon.png',
    badge: '/icon.png',
    data: { ticketId: payload.ticketId || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const ticketId = event.notification.data && event.notification.data.ticketId;
  const target = ticketId ? `/tickets/${ticketId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Onglets déjà ouverts sur le back-office : on les met au premier plan
      // plutôt que d'ouvrir un second onglet du même tableau de bord.
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    })
  );
});