import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const quoteInvoice = await prisma.quoteInvoice.findUnique({
      where: { id },
      include: {
        ticket: {
          include: {
            client: true,
            wifiZone: true,
          },
        },
        lines: true,
        payment: true,
      },
    });

    if (!quoteInvoice) {
      return NextResponse.json(
        { error: "Devis/Facture non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: quoteInvoice });
  } catch (error) {
    console.error("Get quote invoice error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du devis/facture" },
      { status: 500 }
    );
  }
}
