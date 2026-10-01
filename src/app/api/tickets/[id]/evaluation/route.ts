import { NextRequest, NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/** Intervention close, donc dont le client peut juger le résultat. */
const EVALUABLE = new Set(["COMPLETED", "CLOSED"]);

/**
 * Avis d'un client sur l'intervention du technicien.
 *
 * Seul le client concerné peut déposer un avis, et seulement une fois
 * l'intervention terminée : un avis laissé en cours d'intervention jugerait un
 * travail qui n'a pas eu lieu. Un avis par intervention.
 *
 * Le technicien est prévenu : il doit savoir qu'il a été évalué.
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
    const { rating, comment } = await request.json();

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { client: true, evaluation: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    if (auth.role !== "CLIENT" || ticket.client.userId !== auth.userId) {
      return NextResponse.json(
        { error: "Seul le client de cette demande peut laisser un avis" },
        { status: 403 }
      );
    }

    if (!EVALUABLE.has(ticket.status)) {
      return NextResponse.json(
        { error: "L'intervention n'est pas terminée" },
        { status: 400 }
      );
    }

    if (ticket.evaluation) {
      return NextResponse.json(
        { error: "Un avis a déjà été déposé pour cette intervention" },
        { status: 409 }
      );
    }

    // Note sur 5 : bornée, sinon un avis à 0 ou à 100 rendrait la moyenne
    // insensible et les écrans d'affichage faux.
    const note = Number(rating);

    if (!Number.isInteger(note) || note < 1 || note > 5) {
      return NextResponse.json(
        { error: "La note doit être un entier entre 1 et 5" },
        { status: 400 }
      );
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        ticketId: ticket.id,
        clientId: auth.userId,
        technicianId: ticket.technicianId,
        rating: note,
        comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
      },
    });

    if (ticket.technicianId) {
      await notify({
        userIds: [ticket.technicianId],
        type: NotificationType.EVALUATION_RECEIVED,
        title: "Nouvel avis",
        body: `${ticket.client.name ?? "Un client"} vous a attribué ${note}/5 pour l'intervention ${ticket.reference}.`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: evaluation }, { status: 201 });
  } catch (error) {
    console.error("Create evaluation error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'avis" },
      { status: 500 }
    );
  }
}