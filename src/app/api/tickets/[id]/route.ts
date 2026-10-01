import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    return NextResponse.json({ data: ticket });
  } catch (error) {
    console.error("Get ticket error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du ticket" },
      { status: 500 }
    );
  }
}
