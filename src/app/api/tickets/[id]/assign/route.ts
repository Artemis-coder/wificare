import { NextRequest, NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";

/**
 * Affecte un technicien à une demande.
 *
 * Réservée à la régie : affecter quelqu'un est une décision d'encadrement,
 * pas une action de terrain. Un technicien ne peut donc pas s'attribuer une
 * demande, ni affecter un collègue. La régie est composée des administrateurs
 * et des super administrateurs.
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

    if (!isStaff(auth.role)) {
      return NextResponse.json(
        { error: "Seul un administrateur peut affecter un technicien" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { technicianId } = await request.json();

    if (!technicianId) {
      return NextResponse.json(
        { error: "Le technicien est requis" },
        { status: 400 }
      );
    }

    const technician = await prisma.user.findUnique({
      where: { id: technicianId },
    });

    if (!technician || technician.role !== "TECHNICIAN") {
      return NextResponse.json(
        { error: "Technicien introuvable" },
        { status: 404 }
      );
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        technicianId,
        status: "ASSIGNED",
      },
      include: {
        client: true,
        wifiZone: true,
        technician: true,
      },
    });

    // Le technicien découvre son intervention, le client sait qui intervient.
    await notify({
      userIds: [technicianId],
      type: NotificationType.TICKET_ASSIGNED,
      title: "Nouvelle intervention assignée",
      body: `${ticket.reference} · ${ticket.wifiZone.name} — ${ticket.type}.`,
      ticketId: ticket.id,
    });

    if (ticket.client.userId) {
      await notify({
        userIds: [ticket.client.userId],
        type: NotificationType.TICKET_ASSIGNED,
        title: "Technicien désigné",
        body: `${technician.name ?? "Un technicien"} prend en charge ${ticket.reference}.`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: ticket });
  } catch (error) {
    console.error("Assign ticket error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'affectation du ticket" },
      { status: 500 }
    );
  }
}