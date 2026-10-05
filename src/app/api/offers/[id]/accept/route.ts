import { NextRequest, NextResponse } from "next/server";
import { NotificationType, TaskOfferStatus, TicketStatus } from "@prisma/client";

import { requireTechnician } from "@/lib/api-auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { PUBLIC_USER_SELECT } from "@/lib/user-public";

/**
 * Le technicien prend la demande.
 *
 * Deux techniciens ont reçu la même demande au même instant et appuient en même
 * temps. C'est le cas normal du mécanisme, pas sa défaillance : un seul peut
 * l'avoir, et le serveur doit le dire sans que l'autre parte sur le terrain
 * pour rien.
 *
 * La prise se fait donc en deux écritures conditionnelles, chacune exigeant
 * qu'elle soit encore libre. La seconde est celle qui décide : `technicianId`
 * vide est la preuve qu'aucun autre technicien ne l'a prise. Si elle ne modifie
 * aucune ligne, la demande est déjà repartie et la proposition du Perdant est
 * refermée — sans ce garde-fou, deux techniciens interviendraient sur la même
 * panne, et le client ne pourrait pas le savoir.
 *
 * Le message d'erreur dit ce qui s'est passé, et non « conflit » : un technicien
 * qui vient de perdre la course doit comprendre que la demande est prise, pas
 * que l'application a mal fonctionné.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireTechnician(request);

    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const now = new Date();

    const offer = await prisma.taskOffer.findUnique({
      where: { id },
      select: { id: true, ticketId: true, technicianId: true, status: true },
    });

    if (!offer || offer.technicianId !== auth.user.userId) {
      return NextResponse.json(
        { error: "Cette proposition ne vous est pas adressée." },
        { status: 404 }
      );
    }

    const taken = await prisma.$transaction(async (tx) => {
      // La proposition doit être à lui, et encore ouverte : c'est ce qui écarte
      // une double soumission du même technicien, double-clic compris.
      const offerClaim = await tx.taskOffer.updateMany({
        where: {
          id: offer.id,
          technicianId: auth.user.userId,
          status: TaskOfferStatus.PENDING,
        },
        data: { status: TaskOfferStatus.ACCEPTED, respondedAt: now },
      });

      if (offerClaim.count === 0) {
        return false;
      }

      const ticketClaim = await tx.ticket.updateMany({
        where: { id: offer.ticketId, technicianId: null },
        data: {
          technicianId: auth.user.userId,
          status: TicketStatus.ASSIGNED,
          // La circulation s'arrête ici : l'horodatage dit quand, ce qui permet
          // à la régie de lire la durée réelle entre la demande et sa prise.
          lastDispatchedAt: now,
        },
      });

      if (ticketClaim.count === 0) {
        // Un autre technicien a gagné entre-temps. La proposition est refermée
        // sans refus : il n'a rien refusé, la demande a simplement été prise.
        await tx.taskOffer.update({
          where: { id: offer.id },
          data: { status: TaskOfferStatus.WITHDRAWN, respondedAt: now },
        });

        return false;
      }

      return true;
    });

    if (!taken) {
      return NextResponse.json(
        {
          error:
            "Cette demande n'est plus disponible : elle a déjà été prise par un autre technicien.",
        },
        { status: 409 }
      );
    }

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: offer.ticketId },
      include: {
        client: true,
        wifiZone: true,
        technician: { select: PUBLIC_USER_SELECT },
      },
    });

    // Les autres propositions de la même demande sont closes : sans cela, les
    // techniciens qui l'ont encore dans leur file accepteraient dessus et
    // découvriraient le refus au moment de valider.
    await prisma.taskOffer.updateMany({
      where: { ticketId: ticket.id, status: TaskOfferStatus.PENDING },
      data: { status: TaskOfferStatus.WITHDRAWN, respondedAt: now },
    });

    if (ticket.client.userId) {
      await notify({
        userIds: [ticket.client.userId],
        type: NotificationType.TICKET_ASSIGNED,
        title: "Technicien désigné",
        body: `${ticket.technician?.name ?? "Un technicien"} prend en charge ${
          ticket.reference
        }.`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: ticket });
  } catch (error) {
    console.error("Accept task offer error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la prise de la demande" },
      { status: 500 }
    );
  }
}