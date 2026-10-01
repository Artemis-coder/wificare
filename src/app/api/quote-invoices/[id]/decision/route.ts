import { NextRequest, NextResponse } from "next/server";
import { NotificationType, TicketStatus } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Décision du client sur un devis.
 *
 * Le devis engage le client : c'est lui qui l'accepte ou le refuse, et lui
 * seul. Le technicien ne peut ni valider à sa place ni exiger l'acceptation —
 * il peut seulement attendre qu'elle vienne, ou constater le refus.
 *
 * L'acceptation et le règlement sont deux gestes distincts : accepter porte sur
 * le travail à faire, régler sur l'argent.Confondre les deux obligerait le
 * client à payer pour autoriser une intervention, et le priverait du droit de
 * refuser en gardant son argent.
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

    const { id } = await params;
    const { decision } = await request.json();

    if (decision !== "ACCEPT" && decision !== "REJECT") {
      return NextResponse.json(
        { error: "Décision invalide : ACCEPT ou REJECT attendu" },
        { status: 400 }
      );
    }

    const invoice = await prisma.quoteInvoice.findUnique({
      where: { id },
      include: {
        ticket: { include: { client: true, technician: true } },
        payment: true,
      },
    });

    if (!invoice || !invoice.ticket) {
      return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
    }

    // Seul le client concerné décide. Le technicien qui a rédigé le devis est
    // précisément celui dont la réponse ne peut pas être présumée.
    if (invoice.ticket.client.userId !== auth.userId) {
      return NextResponse.json(
        { error: "Ce devis ne vous est pas adressé" },
        { status: 403 }
      );
    }

    // Un devis déjà réglé est un contrat exécuté : on ne le rediscute pas.
    if (invoice.payment) {
      return NextResponse.json(
        { error: "Ce devis a déjà été réglé" },
        { status: 409 }
      );
    }

    // Seul un devis envoyé attend une décision. Un brouillon n'a pas encore
    // été vu, et un devis déjà tranché ne se reprend pas en silence.
    if (invoice.status !== "SENT") {
      return NextResponse.json(
        { error: "Ce devis n'attend pas de décision" },
        { status: 409 }
      );
    }

    const accepted = decision === "ACCEPT";

    const updated = await prisma.$transaction(async (tx) => {
      const quote = await tx.quoteInvoice.update({
        where: { id },
        data: {
          status: accepted ? "ACCEPTED" : "REJECTED",
          // L'acceptation ne vaut pas règlement : les deux dates sont
          // conservées séparément pour que la piste reste lisible.
          acceptedAt: accepted ? new Date() : null,
          rejectedAt: accepted ? null : new Date(),
        },
      });

      // Un refus ne clôt pas la demande : le client a rejeté un montant, pas
      // l'intervention. La demande revient en réparation, où le technicien peut
      // corriger son devis ou signaler une impossibilité.
      if (!accepted) {
        await tx.ticket.update({
          where: { id: invoice.ticket!.id },
          data: { status: TicketStatus.REPAIRING },
        });
      }

      return quote;
    });

    // Le technicien attend cette réponse : il ne peut pas avancer sans elle.
    if (invoice.ticket.technicianId) {
      await notify({
        userIds: [invoice.ticket.technicianId],
        type: accepted
          ? NotificationType.QUOTE_ACCEPTED
          : NotificationType.QUOTE_REJECTED,
        title: accepted ? "Devis accepté" : "Devis refusé",
        body: accepted
          ? `${invoice.ticket.reference} · ${invoice.ticket.client.name} a accepté votre devis de ${invoice.totalAmount.toLocaleString("fr-FR")} FCFA. Vous pouvez lancer la réparation.`
          : `${invoice.ticket.reference} · ${invoice.ticket.client.name} a refusé votre devis de ${invoice.totalAmount.toLocaleString("fr-FR")} FCFA. Corrigez-le ou signalez une impossibilité.`,
        ticketId: invoice.ticket.id,
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Quote decision error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de votre décision" },
      { status: 500 }
    );
  }
}