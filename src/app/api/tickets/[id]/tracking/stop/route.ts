import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Arrêt du suivi de position d'une demande.
 *
 * Le technicien coupe le suivi quand il n'a plus de raison d'envoyer sa
 * position : il est arrivé, ou le suivi de sa tournée a été interrompu. Sans
 * cela, le client continuerait de voir un technicien « en route » alors qu'il
 * travaille déjà à la prise.
 *
 * Réservé au technicien affecté, comme l'envoi de position : l'arrêt n'est que
 * la fin du même flux.
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
      select: { id: true, technicianId: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    if (ticket.technicianId !== auth.userId) {
      return NextResponse.json(
        { error: "Cette demande ne vous est pas affectée" },
        { status: 403 }
      );
    }

    // Un suivi déjà arrêté, ou jamais démarré, n'a rien à clôturer : l'appel
    // reste un succès idempotent, l'application ne peut pas supposer qu'un
    // point a été envoyé.
    const existing = await prisma.technicianTracking.findUnique({
      where: { ticketId: ticket.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ data: { stoppedAt: null } });
    }

    const stoppedAt = new Date();

    await prisma.technicianTracking.update({
      where: { id: existing.id },
      data: { stoppedAt },
    });

    return NextResponse.json({ data: { stoppedAt } });
  } catch (error) {
    console.error("Stop ticket tracking error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'arrêt du suivi" },
      { status: 500 }
    );
  }
}
