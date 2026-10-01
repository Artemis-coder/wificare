import { prisma } from '@/lib/prisma';
import { dispatchDueBroadcasts } from '@/lib/broadcast';

/**
 * Déclencheur des campagnes programmées.
 *
 * L'hébergement ne permet qu'une tâche automatique par jour, ce qui est
 * incompatible avec une coupure prévue à 14 h : elle partirait le lendemain
 * matin. L'appel est donc fait de l'extérieur — ici toutes les cinq minutes —
 * et cette route se contente d'envoyer ce qui est dû.
 *
 * Elle est publique par nature, un déclencheur extérieur n'ayant pas de session
 * : un jeton partagé la protège. Sans lui, n'importe qui pourrait déclencher des
 * envois, et donc faire sonner les téléphones de la plateforme.
 */
export async function GET(request: Request) {
  const secret = process.env.BROADCAST_CRON_SECRET?.trim();

  if (!secret) {
    return Response.json(
      { error: 'BROADCAST_CRON_SECRET absent : envoi programmé désactivé.' },
      { status: 503 }
    );
  }

  if (request.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Interdit.' }, { status: 401 });
  }

  const result = await dispatchDueBroadcasts();

  return Response.json({
    ...result,
    remaining: await prisma.broadcast.count({
      where: { status: 'SCHEDULED', scheduledFor: { lte: new Date() } },
    }),
  });
}