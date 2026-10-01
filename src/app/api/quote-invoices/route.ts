import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { NotificationType, TicketStatus } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Liste des devis et factures.
 *
 * Un client ne voit que ses propres devis : sans ce filtre, il pourrait lire
 * les interventions des autres en changeant le paramètre `clientId`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get("ticketId");
    const clientId = searchParams.get("clientId");

    // Un technicien ne voit que les devis de ses propres interventions.
    const scope: Prisma.QuoteInvoiceWhereInput =
      auth.role === "CLIENT"
        ? { ticket: { client: { userId: auth.userId } } }
        : auth.role === "TECHNICIAN"
          ? { ticket: { technicianId: auth.userId } }
          : {};

    // Les filtres demandés par l'appelant s'ajoutent à cette portée, ils ne
    // peuvent pas l'élargir.
    const where: Prisma.QuoteInvoiceWhereInput = {
      AND: [
        scope,
        ...(ticketId ? [{ ticketId }] : []),
        ...(clientId ? [{ ticket: { clientId } }] : []),
      ],
    };

    const quoteInvoices = await prisma.quoteInvoice.findMany({
      where,
      include: {
        ticket: { include: { client: true } },
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

type DraftLine = {
  description: unknown;
  quantity: unknown;
  unitPrice: unknown;
};

/**
 * Rédaction d'un devis par le technicien, puis envoi au client.
 *
 * Réservée au technicien affecté : c'est lui qui constate le travail, donc lui
 * seul peut chiffrer l'intervention. Un devis reste modifiable tant qu'il est
 * à l'état `DRAFT` ; une fois envoyé, il part chez le client et n'est plus
 * modifiable — celui-ci a pu en prendre connaissance.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (auth.role !== "TECHNICIAN") {
      return NextResponse.json(
        { error: "Seul un technicien peut établir un devis" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { ticketId, lines, notes } = body as {
      ticketId?: unknown;
      lines?: DraftLine[];
      notes?: unknown;
    };

    if (typeof ticketId !== "string" || !ticketId) {
      return NextResponse.json(
        { error: "La demande concernée est requise" },
        { status: 400 }
      );
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { client: true, wifiZone: true, technician: true, quoteInvoice: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    if (ticket.technicianId !== auth.userId) {
      return NextResponse.json(
        { error: "Cette demande ne vous est pas affectée" },
        { status: 403 }
      );
    }

    if (ticket.quoteInvoice && ticket.quoteInvoice.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Un devis a déjà été envoyé pour cette demande" },
        { status: 409 }
      );
    }

    const drafts = Array.isArray(lines) ? lines : [];

    const cleaned = drafts
      .map((line) => ({
        description:
          typeof line.description === "string" ? line.description.trim() : "",
        quantity: toPositiveNumber(line.quantity),
        unitPrice: toPositiveNumber(line.unitPrice),
      }))
      .filter((line) => line.description.length > 0);

    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: "Le devis doit comporter au moins une ligne" },
        { status: 400 }
      );
    }

    // Un devis sans montant ne peut pas être réglé : mieux vaut le refuser
    // maintenant que le découvrir à la demande de paiement.
    const prepared = cleaned.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalPrice: roundMoney(line.quantity * line.unitPrice),
    }));

    const totalAmount = roundMoney(
      prepared.reduce((sum, line) => sum + line.totalPrice, 0)
    );

    if (totalAmount <= 0) {
      return NextResponse.json(
        { error: "Le montant total du devis doit être supérieur à zéro" },
        { status: 400 }
      );
    }

    // Réécrire le devis en une transaction : le client ne doit jamais voir un
    // devis sans ses lignes, ni des lignes sans le total qui les récapitule.
    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({
        where: { quoteInvoiceId: ticket.quoteInvoice?.id ?? "__none__" },
      });

      if (ticket.quoteInvoice) {
        return tx.quoteInvoice.update({
          where: { id: ticket.quoteInvoice.id },
          data: {
            status: "SENT",
            totalAmount,
            notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
            sentAt: new Date(),
            lines: { create: prepared },
          },
          include: { lines: true },
        });
      }

      return tx.quoteInvoice.create({
        data: {
          ticketId: ticket.id,
          type: "QUOTE",
          status: "SENT",
          totalAmount,
          notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
          sentAt: new Date(),
          lines: { create: prepared },
        },
        include: { lines: true },
      });
    });

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.PENDING_QUOTE },
    });

    // Le devis attend une décision du client : c'est lui qui doit être prévenu.
    if (ticket.client.userId) {
      await notify({
        userIds: [ticket.client.userId],
        type: NotificationType.QUOTE_SENT,
        title: "Devis reçu",
        body: `${ticket.reference} · ${ticket.technician?.name ?? "Le technicien"} a envoyé un devis de ${totalAmount.toLocaleString("fr-FR")} FCFA.`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    console.error("Create quote error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du devis" },
      { status: 500 }
    );
  }
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/**
 * Quantité et prix unitaire.
 *
 * Le prix est forcé positif : un prix négatif transformerait le devis en
 * demande de remboursement au client, ce que la plateforme ne gère pas.
 */
function toPositiveNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return roundMoney(parsed);
}