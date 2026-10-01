import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { amount, channel, reference, proofUrl } = await request.json();

    // Vérifier si le ticket a une facture
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { quoteInvoice: true },
    });

    if (!ticket || !ticket.quoteInvoice) {
      return NextResponse.json(
        { error: "Ce ticket n'a pas de facture associée" },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.create({
      data: {
        quoteInvoiceId: ticket.quoteInvoice.id,
        amount,
        channel,
        reference,
        proofUrl,
        status: "COMPLETED",
      },
    });

    // Mettre à jour le statut du ticket
    await prisma.ticket.update({
      where: { id },
      data: { status: "CLOSED" },
    });

    return NextResponse.json({ data: payment });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement du paiement" },
      { status: 500 }
    );
  }
}
