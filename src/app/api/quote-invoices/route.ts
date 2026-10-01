import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get("ticketId");
    const clientId = searchParams.get("clientId");

    // Les filtres sont cumulables : une facture peut etre demandee par demande
    // ou par client, et les deux si les deux parametres sont fournis.
    const where: Prisma.QuoteInvoiceWhereInput = {
      ...(ticketId ? { ticketId } : {}),
      ...(clientId ? { ticket: { clientId } } : {}),
    };

    const quoteInvoices = await prisma.quoteInvoice.findMany({
      where,
      include: {
        ticket: {
          include: {
            client: true,
          },
        },
        lines: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: quoteInvoices });
  } catch (error) {
    console.error("Get quote invoices error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des devis/factures" },
      { status: 500 }
    );
  }
}
