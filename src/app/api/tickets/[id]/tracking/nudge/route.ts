import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { notifyTrackingNudge } from "@/lib/push";

/**
 * Demande au technicien de réactiver le suivi de position.
 *
 * Un client qui attend une ETA peut être servi par un technicien dont le
 * téléphone n'envoie plus sa position — batterie, réseau, application en
 * arrière-plan. Lui seul peut y remédier : le serveur n'a aucun moyen de le
 * détecter à sa place. Cette route lui envoie donc une demande, et le
 * laisse décider.
 *
 * Réservée au client de la demande : c'est son écran qui est concerné, et un
 * tiers n'a pas à savoir qu'un suivi de position est arrêté.
 *
 * Répond toujours en succès, y compris sans technicien affecté ou sans appareil
 * abonné : « le technicien n'a pas été prévenu » n'est pas « la demande a
 * échoué », et le client n'a rien à corriger de son côté.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { client: { select: { userId: true } } },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    if (auth.role !== "CLIENT" || ticket.client.userId !== auth.userId) {
      return NextResponse.json(
        { error: "Seul le client de cette demande peut demander un suivi" },
        { status: 403 }
      );
    }

    if (ticket.technicianId) {
      // La demande part en tâche de fond : la réponse au client ne doit pas
      // attendre un aller-retour vers Firebase, et l'appel ne lève jamais.
      void notifyTrackingNudge([ticket.technicianId], {
        ticketId: ticket.id,
        reference: ticket.reference,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nudge ticket tracking error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la demande de suivi" },
      { status: 500 }
    );
  }
}
