import { dispatchPendingTickets } from '@/lib/dispatch';

/**
 * Filet de sécurité de la boucle de répartition.
 *
 * La boucle est normalement portée par le trafic des applications : création
 * d'une demande, mise en ligne d'un technicien, lecture de la file, réponse à
 * une proposition. Ces quatre points suffisent à faire tourner le circuit tant
 * qu'au moins un technicien a son application ouverte.
 *
 * Il reste un trou, et il est réel : si une demande tombe pendant que tous les
 * techniciens en ligne ont l'application fermée, personne ne la voit avant le
 * prochain appel — la demande attend, et le client ne comprend pas pourquoi.
 * Cette route comble ce trou pour un déployeur qui appelle un déclencheur
 * extérieur à intervalle court.
 *
 * Elle ne rend le service indispensable à rien : sans appel, la plateforme
 * fonctionne. C'est une amélioration de la circulation, pas une condition de
 * fonctionnement, et la route dit explicitement ce qu'elle a fait plutôt que de
 * laisser croire que la répartition a eu lieu.
 *
 * Protégée par le même secret partagé que les campagnes programmées : elle
 * déclenche des envois, et donc fait sonner les téléphones de la plateforme.
 */
export async function GET(request: Request) {
  const secret = process.env.BROADCAST_CRON_SECRET?.trim();

  if (!secret) {
    return Response.json(
      { error: 'BROADCAST_CRON_SECRET absent : déclencheur de répartition désactivé.' },
      { status: 503 }
    );
  }

  if (request.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Interdit.' }, { status: 401 });
  }

  const report = await dispatchPendingTickets();

  return Response.json(report);
}