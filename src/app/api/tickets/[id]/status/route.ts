import { NextRequest, NextResponse } from "next/server";
import { NotificationType, TicketStatus } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { formatAmount, quoteAuthorizesRepair } from "@/lib/quotes";
import { loadWritableTicket } from "@/lib/tickets";
import { PUBLIC_USER_SELECT } from "@/lib/user-public";

const STATUSES = new Set<string>(Object.values(TicketStatus));

/**
 * Fait avancer une demande.
 *
 * Le contrôle des droits est délégué à `loadWritableTicket`, le même que celui
 * du rapport d'intervention : les deux décrivent la même intervention, et une
 * règle qui les départagerait permettrait d'écrire ce que l'autre refuse.
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
    const { status } = await request.json();

    if (!status || !STATUSES.has(status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    const writable = await loadWritableTicket(auth, id);

    if (!writable.ok) {
      return NextResponse.json({ error: writable.error }, { status: writable.status });
    }

    const existing = await prisma.ticket.findUnique({
      where: { id },
      include: { quoteInvoice: { include: { payment: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    // Une réparation ne démarre pas sur un devis que le client n'a pas
    // accepté : c'est lui qui autorise qu'on touche à son installation, et le
    // technicien qui a rédigé le devis ne peut pas s'accorder lui-même cette
    // autorisation. Le refus ramène la demande en réparation, où il reste
    // légitime d'intervenir — d'où la condition ci-dessous, qui ne vise que le
    // passage depuis un devis en attente.
    //
    // Un devis payé autorise autant qu'un devis accepté, voire plus : c'est le
    // même accord, déjà honoré. Exiger `ACCEPTED` ici produisait une impasse —
    // le client pouvait régler avant que le technicien n'ait fait avancer la
    // demande, et celle-ci restait en devis en attente avec un devis payé,
    // que cette règle refusait de franchir. Ni l'API ni l'écran du technicien
    // n'étaient alors plus aucun recours.
    if (
      existing.status === TicketStatus.PENDING_QUOTE &&
      status === TicketStatus.REPAIRING &&
      !quoteAuthorizesRepair(existing.quoteInvoice?.status)
    ) {
      return NextResponse.json(
        {
          error:
            "Le client doit accepter le devis avant que la réparation puisse commencer.",
        },
        { status: 409 }
      );
    }

    // Annuler une demande que le client a déjà payée laisserait son argent
    // dans le dossier sans contrepartie : le devis reste `PAID`, le paiement
    // `COMPLETED`, et rien ne dit plus jamais que la somme a été rendue. Le
    // statut `REFUNDED` existait dans le modèle depuis le début et ne recevait
    // jamais cette valeur.
    //
    // Le geste reste celui du technicien : il annule, et la restitution suit
    // l'annulation. Lui demander une confirmation séparée l'obligerait à
    // prodiguer un remboursement qui n'est pas le sien, et à hésiter devant une
    // annulation légitime parce qu'un client a déjà payé.
    //
    // Le test porte sur le statut du paiement et non sur son existence : sans
    // lui, une seconde annulation de la même demande enregistrerait un
    // deuxième remboursement pour une somme déjà rendue.
    const refundable =
      status === TicketStatus.CANCELED &&
      existing.quoteInvoice?.payment?.status === "COMPLETED";

    const ticket = await prisma.$transaction(async (tx) => {
      if (refundable) {
        await tx.payment.update({
          where: { id: existing.quoteInvoice!.payment!.id },
          data: { status: "REFUNDED" },
        });
      }

      return tx.ticket.update({
        where: { id },
        data: { status },
        include: {
          client: true,
          wifiZone: true,
          technician: { select: PUBLIC_USER_SELECT },
        },
      });
    });

    // Le client est la partie interestée : c'est lui qui suit le traitement.
    const label = STATUS_LABEL[status as TicketStatus] ?? status;

    if (ticket.client.userId && writable.data.status !== status) {
      await notify({
        userIds: [ticket.client.userId],
        type:
          status === TicketStatus.CANCELED
            ? NotificationType.TICKET_CANCELED
            : NotificationType.TICKET_STATUS_CHANGED,
        title:
          status === TicketStatus.CANCELED
            ? "Demande annulée"
            : `${ticket.reference} : ${label}`,
        body:
          status === TicketStatus.CANCELED
            ? refundable
              ? `Votre demande ${ticket.reference} a été annulée. Le devis de ${formatAmount(existing.quoteInvoice!.totalAmount)} que vous aviez réglé vous est restitué.`
              : `Votre demande ${ticket.reference} a été annulée.`
            : `Votre demande est maintenant « ${label} ».`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: ticket });
  } catch (error) {
    console.error("Update ticket status error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du statut" },
      { status: 500 }
    );
  }
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "Nouveau",
  TO_VERIFY: "À vérifier",
  ASSIGNED: "Affecté",
  CONFIRMED: "Rendez-vous confirmé",
  EN_ROUTE: "En route",
  DIAGNOSING: "En diagnostic",
  PENDING_QUOTE: "Devis en attente",
  REPAIRING: "En réparation",
  COMPLETED: "Terminé",
  PENDING_PAYMENT: "Paiement en attente",
  CLOSED: "Clôturé",
  CANCELED: "Annulé",
};