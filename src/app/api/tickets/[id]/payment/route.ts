import { NextRequest, NextResponse } from "next/server";

import { getApiUser } from "@/lib/api-auth";
import { payQuote } from "@/lib/quotes";

/**
 * Enregistre le règlement d'un devis par le client.
 *
 * La règle est dans `lib/quotes` : l'application mobile et le back-office web
 * appellent la même fonction, et appliquent donc la même contrainte.
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
    const body = await request.json();

    const result = await payQuote(auth, id, {
      channel: body.channel,
      operator: body.operator,
      transactionRef: body.transactionRef,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement du paiement" },
      { status: 500 }
    );
  }
}
