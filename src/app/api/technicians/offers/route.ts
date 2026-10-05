import { NextRequest, NextResponse } from "next/server";
import { TaskOfferStatus } from "@prisma/client";

import { requireTechnician } from "@/lib/api-auth";
import { dispatchPendingTickets, OFFER_TTL_MS } from "@/lib/dispatch";
import { prisma } from "@/lib/prisma";

/**
 * File des demandes proposées au technicien, et tic de la boucle.
 *
 * Cet appel est à la fois ce que l'application affiche et ce qui fait tourner
 * la répartition. Il est donc appelé toutes les cinq secondes tant que
 * l'application est au premier plan, et il rend deux choses : la présence du
 * technicien et les demandes qu'il peut prendre.
 *
 * La répartition est relancée à chaque appel, y compris quand le technicien
 * qui interroge est hors ligne. C'est volontaire : un technicien qui lit sa
 * file en se reposant ne doit pas être le point mort du circuit, et le
 * déclencheur le plus régulier disponible est précisément celui-ci.
 *
 * Le contenu de la demande est renvoyé avec la proposition. Le technicien n'est
 * pas affecté et n'a donc aucun droit de lecture sur la demande — sans cela il
 * devrait choisir une offre sur la seule référence, sans savoir ni le lieu ni la
 * panne, et il ne pourrait pas juger si l'intervention lui convient.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireTechnician(request);

    if (!auth.ok) {
      return auth.response;
    }

    const now = new Date();

    // Chaque appel est une preuve de vie : c'est ce qui permet au back-office de
    // distinguer un technicien en ligne de celui qui l'était mais ne répond
    // plus. L'écriture précède la lecture du circuit, pour qu'un technicien qui
    // interroge sa file et ne reçoit rien ne soit pas rayé par erreur.
    await prisma.user.update({
      where: { id: auth.user.userId },
      data: { lastSeenAt: now },
    });

    await dispatchPendingTickets();

    const [user, offers] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.user.userId },
        select: { isOnline: true, onlineSince: true, lastSeenAt: true },
      }),
      prisma.taskOffer.findMany({
        where: {
          technicianId: auth.user.userId,
          status: TaskOfferStatus.PENDING,
          offeredAt: { gte: new Date(now.getTime() - OFFER_TTL_MS) },
        },
        select: {
          id: true,
          offeredAt: true,
          ticket: {
            select: {
              id: true,
              reference: true,
              type: true,
              priority: true,
              status: true,
              description: true,
              createdAt: true,
              wifiZone: {
                select: { name: true, location: true, latitude: true, longitude: true },
              },
              client: { select: { name: true, contact: true } },
              files: { select: { id: true, url: true, fileType: true } },
            },
          },
        },
        orderBy: { offeredAt: "asc" },
      }),
    ]);

    return NextResponse.json({
      data: {
        isOnline: user?.isOnline ?? false,
        onlineSince: user?.onlineSince ?? null,
        lastSeenAt: user?.lastSeenAt ?? null,
        serverNow: now,
        items: offers.map((offer) => ({
          id: offer.id,
          offeredAt: offer.offeredAt,
          ticket: offer.ticket,
        })),
      },
    });
  } catch (error) {
    console.error("List technician offers error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la lecture des demandes disponibles" },
      { status: 500 }
    );
  }
}