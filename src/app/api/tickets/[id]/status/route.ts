import { NextRequest, NextResponse } from "next/server";
import { NotificationType, TicketStatus } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const STATUSES = new Set<string>(Object.values(TicketStatus));

/**
 * Fait avancer une demande.
 *
 * Seul le technicien affecté peut faire avancer sa propre intervention : sans
 * ce contrôle, n'importe quel compte authentifié — y compris un autre client —
 * pourrait clore la demande d'autrui.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;
    const { status } = await request.json();

    if (!status || !STATUSES.has(status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    const existing = await prisma.ticket.findUnique({
      where: { id },
      include: { client: true, technician: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    // Le client suit sa demande, il ne la fait pas avancer lui-même.
    if (auth.role === "TECHNICIAN" && existing.technicianId !== auth.userId) {
      return NextResponse.json(
        { error: "Cette demande ne vous est pas affectée" },
        { status: 403 }
      );
    }

    if (auth.role === "CLIENT") {
      return NextResponse.json(
        { error: "Seul le technicien peut faire avancer une demande" },
        { status: 403 }
      );
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: { status },
      include: {
        client: true,
        wifiZone: true,
        technician: true,
      },
    });

    // Le client est la partie interestée : c'est lui qui suit le traitement.
    const label = STATUS_LABEL[status as TicketStatus] ?? status;

    if (ticket.client.userId && existing.status !== status) {
      await notify({
        userIds: [ticket.client.userId],
        type:
          status === TicketStatus.CANCELED
            ? NotificationType.TICKET_CANCELED
            : NotificationType.TICKET_STATUS_CHANGED,
        title:
          status === TicketStatus.CANCELED
            ? "Demande annulée"
            : `${ticket.reference} : ${label}`,
        body:
          status === TicketStatus.CANCELED
            ? `Votre demande ${ticket.reference} a été annulée.`
            : `Votre demande est maintenant « ${label} ».`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: ticket });
  } catch (error) {
    console.error("Update ticket status error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du statut" },
      { status: 500 }
    );
  }
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "Nouveau",
  TO_VERIFY: "À vérifier",
  ASSIGNED: "Affecté",
  CONFIRMED: "Rendez-vous confirmé",
  EN_ROUTE: "En route",
  DIAGNOSING: "En diagnostic",
  PENDING_QUOTE: "Devis en attente",
  REPAIRING: "En réparation",
  COMPLETED: "Terminé",
  PENDING_PAYMENT: "Paiement en attente",
  CLOSED: "Clôturé",
  CANCELED: "Annulé",
};