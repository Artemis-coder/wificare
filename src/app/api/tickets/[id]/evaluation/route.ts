import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { rating, comment } = await request.json();

    // Récupérer le ticket pour avoir le clientId
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket non trouvé" }, { status: 404 });
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        ticketId: id,
        clientId: ticket.client.userId || "",
        rating,
        comment,
      },
    });

    return NextResponse.json({ data: evaluation });
  } catch (error) {
    console.error("Create evaluation error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'évaluation" },
      { status: 500 }
    );
  }
}
