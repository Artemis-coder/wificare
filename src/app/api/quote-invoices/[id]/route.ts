import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Lit un devis ou une facture.
 *
 * Seuls les deux concernés peuvent le lire : le client à qui il est adressé et
 * le technicien qui l'a rédigé. Sans ce contrôle, l'identifiant d'un devis
 * suffirait à en lire le contenu — montant, interventions facturées, notes du
 * technicien — auprès de n'importe quel compte authentifié.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

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

    if (!quoteInvoice || !quoteInvoice.ticket) {
      return NextResponse.json(
        { error: "Devis/Facture non trouvé" },
        { status: 404 }
      );
    }

    const isAddressedClient =
      quoteInvoice.ticket.client.userId === auth.userId;
    const isAuthor = quoteInvoice.ticket.technicianId === auth.userId;

    if (!isAddressedClient && !isAuthor) {
      return NextResponse.json(
        { error: "Ce devis ne vous est pas adressé" },
        { status: 403 }
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
