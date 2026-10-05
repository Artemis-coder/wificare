import { NextRequest, NextResponse } from "next/server";
import { TaskOfferStatus } from "@prisma/client";

import { requireTechnician } from "@/lib/api-auth";
import { dispatchPendingTickets } from "@/lib/dispatch";
import { prisma } from "@/lib/prisma";

/**
 * Le technicien se met en ligne ou hors ligne.
 *
 * C'est le geste qui conditionne toute la répartition : tant qu'il n'est pas
 * posé, aucune demande ne lui est proposée. Il est volontaire, explicite, et
 * survit à la fermeture de l'application — un technicien en tournée ne garde pas
 * son écran allumé, et une disponibilité qui s'éteindrait avec lui ne
 * servirait à rien.
 *
 * Le corps ne porte qu'un booléen : l'état du compte reste la seule vérité, et
 * deux écrans qui se contrediraient sur la disponibilité d'un technicien
 * convergeraient ici.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireTechnician(request);

    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();

    if (typeof body?.online !== "boolean") {
      return NextResponse.json(
        { error: "Indiquez si le technicien est en ligne." },
        { status: 400 }
      );
    }

    const now = new Date();

    const user = await prisma.user.update({
      where: { id: auth.user.userId },
      data: {
        isOnline: body.online,
        // L'horodatage ne bouge qu'au moment où le technicien change d'état :
        // le laisser réécrire à chaque appel le ferait dire « en ligne depuis
        // cinq secondes » à un technicien en ligne depuis la matinée.
        onlineSince: body.online ? now : null,
        lastSeenAt: now,
      },
      select: { id: true, isOnline: true, onlineSince: true, lastSeenAt: true },
    });

    if (!body.online) {
      // Un technicien qui se retire ne doit pas continuer de retenir des
      // demandes : ses propositions en attente sont closes, pas refusées, pour
      // qu'il puisse les récupérer en se remettant en ligne.
      await prisma.taskOffer.updateMany({
        where: { technicianId: user.id, status: TaskOfferStatus.PENDING },
        data: { status: TaskOfferStatus.WITHDRAWN, respondedAt: now },
      });
    }

    // Se mettre en ligne, c'est vouloir du travail maintenant : la file est
    // parcourue dans la foulée, sans attendre le prochain passage d'un autre
    // technicien.
    const dispatch = await dispatchPendingTickets();

    const pendingOffers = body.online
      ? await prisma.taskOffer.count({
          where: { technicianId: user.id, status: TaskOfferStatus.PENDING },
        })
      : 0;

    return NextResponse.json({
      data: {
        isOnline: user.isOnline,
        onlineSince: user.onlineSince,
        lastSeenAt: user.lastSeenAt,
        pendingOffers,
        dispatch,
      },
    });
  } catch (error) {
    console.error("Set technician presence error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la disponibilité" },
      { status: 500 }
    );
  }
}