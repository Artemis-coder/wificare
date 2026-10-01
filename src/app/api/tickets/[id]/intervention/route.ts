import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const intervention = await prisma.intervention.create({
      data: {
        ticketId: id,
        ...data,
      },
    });

    // Mettre à jour le statut du ticket
    await prisma.ticket.update({
      where: { id },
      data: { status: "DIAGNOSING" },
    });

    return NextResponse.json({ data: intervention });
  } catch (error) {
    console.error("Create intervention error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'intervention" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const intervention = await prisma.intervention.update({
      where: { ticketId: id },
      data,
    });

    return NextResponse.json({ data: intervention });
  } catch (error) {
    console.error("Update intervention error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'intervention" },
      { status: 500 }
    );
  }
}
