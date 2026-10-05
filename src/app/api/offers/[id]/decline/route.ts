import { NextRequest, NextResponse } from "next/server";
import { TaskOfferStatus } from "@prisma/client";

import { requireTechnician } from "@/lib/api-auth";
import { dispatchPendingTickets } from "@/lib/dispatch";
import { prisma } from "@/lib/prisma";

/**
 * Le technicien renonce à la demande.
 *
 * Le refus est une décision, pas un oubli : la demande ne lui sera plus
 * reproposée tant qu'elle n'aura pas quitté le circuit. C'est ce qui permet à
 * la demande de tourner — elle passe au suivant, puis à celui d'après, sans que
 * le premier technicien soit relancé toutes les cinq secondes.
 *
 * C'est aussi ce qui rend le circuit honnête : un technicien qui ne peut pas
 * prendre une demande parce qu'il est de l'autre côté de la ville doit pouvoir
 * l'écarter, sinon il finit par accepter pour la faire disparaître de son
 * écran, et se retrouve en route pour rien.
 *
 * La répartition est relancée immédiatement plutôt qu'au prochain tic de la
 * boucle : le refus vient d'arriver, l'informer du refus est le seul moment où
 * le circuit peut encore tourner vite.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireTechnician(request);

    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;

    const declined = await prisma.taskOffer.updateMany({
      where: { id, technicianId: auth.user.userId, status: TaskOfferStatus.PENDING },
      data: { status: TaskOfferStatus.DECLINED, respondedAt: new Date() },
    });

    if (declined.count === 0) {
      // Déjà répondue, ou proposition d'un autre technicien : dans les deux cas
      // il n'y a rien à changer, et un refus supplémentaire n'aurait de sens
      // dans aucun des deux.
      return NextResponse.json(
        { error: "Cette proposition n'est plus en attente de réponse." },
        { status: 409 }
      );
    }

    await dispatchPendingTickets();

    return NextResponse.json({ data: { id, status: "DECLINED" } });
  } catch (error) {
    console.error("Decline task offer error:", error);
    return NextResponse.json(
      { error: "Erreur lors du refus de la demande" },
      { status: 500 }
    );
  }
}