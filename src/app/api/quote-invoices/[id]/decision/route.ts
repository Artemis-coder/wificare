import { NextRequest, NextResponse } from "next/server";

import { getApiUser } from "@/lib/api-auth";
import { decideQuote, type QuoteDecision } from "@/lib/quotes";

/**
 * Décision du client sur un devis.
 *
 * La règle est dans `lib/quotes` : l'application mobile et le back-office web
 * appellent la même fonction, et appliquent donc la même contrainte.
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
    const { decision } = (await request.json()) as { decision?: QuoteDecision };

    const result = await decideQuote(auth, id, decision as QuoteDecision);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("Quote decision error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de votre décision" },
      { status: 500 }
    );
  }
}
