import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { getApiUser } from "@/lib/api-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Flux temps réel des notifications du compte connecté.
 *
 * Les utilisateurs étaient prévenus par relevé périodique : une demande pouvait
 * attendre la fin de l'intervalle avant d'apparaître, et rien n'arrivait si
 * aucun écran n'était ouvert. Le flux corrige les deux : la notification part
 * dès son écriture, et l'application en reçoit une même sans action de sa part.
 *
 * Server-Sent Events plutôt que WebSocket : le sens est unique — le serveur
 * parle, le client écoute — et les SSE traversent le proxys et le réseau mobile
 * sans négociation supplémentaire. La reconnexion, elle, est fournie par le
 * navigateur : il suffit de rouvrir le flux.
 *
 * Chaque événement ne porte que les notifications apparues depuis le dernier
 * envoi, triées par date : le flux ne rejoue donc jamais l'historique.
 */

/** Intervalle entre deux lectures en base. */
const POLL_MS = 1_000;

/** Délai au-delà duquel un commentaire de maintien en vie est envoyé. */
const KEEPALIVE_MS = 20_000;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Deux clients, une seule route : l'application mobile porte un jeton Bearer,
  // le back-office un cookie de session. `EventSource` ne permet pas d'envoyer
  // d'en-tête, le cookie est donc indispensable côté web.
  const bearer = getApiUser(request);
  const session = bearer ? null : await getServerSession(authOptions);
  const userId = bearer?.userId ?? session?.user?.id;

  if (!userId) {
    return new Response("Non authentifié", { status: 401 });
  }

  // Point de départ : la date de la requête. Les notifications plus anciennes
  // sont déjà connues du client, qui les relit au lancement du flux.
  let lastSeen = new Date();
  let lastActivity = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // La connexion peut être coupée par le client ou par le réseau : le flux
      // doit cesser de lire en base dans les deux cas, sinon il continuerait
      // jusqu'à la fin du délai d'exécution.
      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      const loop = async () => {
        while (!closed) {
          try {
            const fresh = await prisma.notification.findMany({
              where: { userId, createdAt: { gt: lastSeen } },
              orderBy: { createdAt: "asc" },
              take: 20,
              select: {
                id: true,
                type: true,
                title: true,
                body: true,
                ticketId: true,
                readAt: true,
                createdAt: true,
              },
            });

            for (const notification of fresh) {
              lastSeen = notification.createdAt;
              send(
                `event: notification\ndata: ${JSON.stringify({
                  id: notification.id,
                  type: notification.type,
                  title: notification.title,
                  body: notification.body,
                  ticketId: notification.ticketId,
                  readAt: notification.readAt?.toISOString() ?? null,
                  createdAt: notification.createdAt.toISOString(),
                })}\n\n`
              );
            }

            if (fresh.length > 0) {
              lastActivity = Date.now();
            } else if (Date.now() - lastActivity > KEEPALIVE_MS) {
              // Maintien en vie : sans données, un proxy peut fermer une
              // connexion silencieuse en quelques dizaines de secondes.
              send(`: keepalive ${Date.now()}\n\n`);
              lastActivity = Date.now();
            }
          } catch (error) {
            console.error("Notification stream error:", error);
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }

        controller.close();
      };

      // En-tête d'ouverture : le client sait que le flux est établi avant la
      // première notification, et `retry` fixe la reprise automatique.
      send(`retry: 3000\n\n`);
      void loop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Les proxys tamponnent par défaut les réponses en flux : sans cet
      // en-tête, les notifications arriveraient par paquets, à l'inverse du
      // but recherché.
      "X-Accel-Buffering": "no",
    },
  });
}