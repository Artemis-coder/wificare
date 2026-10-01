import { NextRequest, NextResponse } from "next/server";
import {
  MobileMoneyOperator,
  NotificationType,
  PaymentChannel,
  TicketStatus,
} from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const CHANNELS = new Set<string>(Object.values(PaymentChannel));
const OPERATORS = new Set<string>(Object.values(MobileMoneyOperator));

const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  CASH: "espèces",
  MOBILE_MONEY: "Mobile Money",
  BANK_TRANSFER: "virement bancaire",
};

const OPERATOR_LABEL: Record<MobileMoneyOperator, string> = {
  WAVE: "Wave",
  ORANGE: "Orange",
  MTN: "MTN",
};

/**
 * Enregistre le règlement d'un devis par le client.
 *
 * Seul le client concerné peut régler : c'est lui qui doit payer et lui seul
 * qui décide du moyen de paiement. Le technicien encaisse, il ne déclare pas
 * le paiement à la place du client.
 *
 * Le montant est celui du devis, jamais celui transmis par l'appelant : le
 * client ne doit pas pouvoir payer un montant de son choix et solder une
 * facture en留下一re un centime.
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
    const { channel, operator, transactionRef } = await request.json();

    if (!channel || !CHANNELS.has(channel)) {
      return NextResponse.json(
        { error: "Moyen de paiement inconnu" },
        { status: 400 }
      );
    }

    // Wave, Orange et MTN ne sont pas interchangeables : l'identité de
    // l'opérateur est ce qui permet de rapprocher la transaction du paiement.
    if (channel === PaymentChannel.MOBILE_MONEY && !OPERATORS.has(operator)) {
      return NextResponse.json(
        { error: "Choisissez l'opérateur Mobile Money (Wave, Orange, MTN)" },
        { status: 400 }
      );
    }

    if (channel !== PaymentChannel.MOBILE_MONEY && operator) {
      return NextResponse.json(
        { error: "Un opérateur n'a de sens que pour un paiement Mobile Money" },
        { status: 400 }
      );
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        client: true,
        wifiZone: true,
        quoteInvoice: { include: { payment: true } },
      },
    });

    if (!ticket || !ticket.quoteInvoice) {
      return NextResponse.json(
        { error: "Cette demande n'a pas de devis à régler" },
        { status: 404 }
      );
    }

    if (ticket.client.userId !== auth.userId) {
      return NextResponse.json(
        { error: "Ce devis ne vous est pas adressé" },
        { status: 403 }
      );
    }

    const invoice = ticket.quoteInvoice;

    if (invoice.payment) {
      return NextResponse.json(
        { error: "Ce devis a déjà été réglé" },
        { status: 409 }
      );
    }

    if (invoice.totalAmount <= 0) {
      return NextResponse.json(
        { error: "Ce devis ne comporte aucun montant à régler" },
        { status: 400 }
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          quoteInvoiceId: invoice.id,
          amount: invoice.totalAmount,
          channel: channel as PaymentChannel,
          operator: (operator as MobileMoneyOperator | undefined) ?? null,
          transactionRef: transactionRef || null,
          status: "COMPLETED",
        },
      });

      await tx.quoteInvoice.update({
        where: { id: invoice.id },
        data: { status: "PAID" },
      });

      await tx.ticket.update({
        where: { id },
        data: { status: TicketStatus.CLOSED },
      });

      return created;
    });

    // Le technicien doit savoir que l'intervention est payée : c'est lui qui
    // encaisse et qui clôt administrativement la demande.
    if (ticket.technicianId) {
      await notify({
        userIds: [ticket.technicianId],
        type: NotificationType.PAYMENT_RECEIVED,
        title: "Devis réglé",
        body: `${ticket.reference} · ${ticket.client.name} a réglé ${invoice.totalAmount.toLocaleString("fr-FR")} FCFA par ${paymentLabel(channel as PaymentChannel, operator as MobileMoneyOperator | undefined)}.`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: payment }, { status: 201 });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement du paiement" },
      { status: 500 }
    );
  }
}

/** Libellé lisible du moyen de paiement, pour les notifications. */
function paymentLabel(
  channel: PaymentChannel,
  operator: MobileMoneyOperator | undefined
): string {
  if (channel === PaymentChannel.MOBILE_MONEY && operator) {
    return `Mobile Money ${OPERATOR_LABEL[operator]}`;
  }

  return CHANNEL_LABEL[channel];
}