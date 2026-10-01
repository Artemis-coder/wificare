import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Résumé de suivi affiché avec la demande.
 *
 * L'application a besoin de l'ETA dès l'ouverture du détail, sans attendre un
 * appel de suivi supplémentaire ni un rafraîchissement de la position : c'est
 * cette seule information qui décide si le client reste ou part ailleurs. Elle
 * accompagne donc la demande dans sa réponse.
 *
 * `null` quand aucun suivi n'existe : l'application alors n'affiche aucun bloc
 * de suivi, ce qui n'est pas la même chose qu'un suivi arrêté.
 */
export type TicketTrackingSummary = {
  active: boolean;
  etaMinutes: number | null;
  distanceMeters: number | null;
  recordedAt: Date;
  technicianName: string | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        client: true,
        wifiZone: {
          include: {
            equipments: true,
          },
        },
        technician: true,
        intervention: true,
        files: true,
        quoteInvoice: {
          include: {
            lines: true,
            payment: true,
          },
        },
        evaluation: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket non trouvé" }, { status: 404 });
    }

    // Requête séparée et non incluse dans celle de la demande : la relation
    // `tracking` du modèle est une liste, alors que l'application attend un
    // objet unique — une ligne par demande, la dernière connue.
    const trackingRow = await prisma.technicianTracking.findUnique({
      where: { ticketId: ticket.id },
      include: { technician: { select: { name: true } } },
    });

    const tracking: TicketTrackingSummary | null = trackingRow
      ? {
          active: trackingRow.stoppedAt === null,
          etaMinutes: trackingRow.etaMinutes,
          distanceMeters: trackingRow.distanceMeters,
          recordedAt: trackingRow.recordedAt,
          // Le nom vient de la ligne de suivi, qui fige le technicien ayant
          // envoyé la position : la demande peut depuis avoir été réaffectée.
          technicianName:
            trackingRow.technician.name ?? ticket.technician?.name ?? null,
        }
      : null;

    return NextResponse.json({ data: { ...ticket, tracking } });
  } catch (error) {
    console.error("Get ticket error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du ticket" },
      { status: 500 }
    );
  }
}
