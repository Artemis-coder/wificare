import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { loadReadableTicket } from "@/lib/tickets";
import { PUBLIC_USER_SELECT } from "@/lib/user-public";

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
  /// Position du technicien, pour la carte de suivi.
  ///
  /// Le client voit déjà où se trouve le technicien qui vient vers sa zone :
  /// c'est l'objet même de l'ETA. Les cacher ne protégeait personne, puisque la
  /// position ne quitte jamais le trajet en cours.
  latitude: number;
  longitude: number;
  /// Position de la zone du client, point d'arrivée. `null` tant qu'il n'a
  /// jamais partagé sa position.
  destinationLatitude: number | null;
  destinationLongitude: number | null;
};

/**
 * Détail d'une demande.
 *
 * La demande porte le contact du client, sa zone, le rapport du technicien, son
 * devis et son règlement : la lecture est donc bornée par `loadReadableTicket`
 * avant même la requête. Un identifiant deviné ne suffit pas à ouvrir la
 * demande d'autrui.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    const readable = await loadReadableTicket(auth, id);

    if (!readable.ok) {
      return NextResponse.json(
        { error: readable.error },
        { status: readable.status }
      );
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        client: true,
        wifiZone: {
          include: {
            equipments: true,
          },
        },
        technician: { select: PUBLIC_USER_SELECT },
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
          latitude: trackingRow.latitude,
          longitude: trackingRow.longitude,
          destinationLatitude: ticket.wifiZone?.latitude ?? null,
          destinationLongitude: ticket.wifiZone?.longitude ?? null,
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
