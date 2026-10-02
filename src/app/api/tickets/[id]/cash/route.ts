import { NextRequest, NextResponse } from "next/server";

import { getApiUser } from "@/lib/api-auth";
import { declareCashCollection } from "@/lib/quotes";

/**
 * Déclaration d'un encaissement en espèces par le technicien.
 *
 * Séparée de `/payment` volontairement : les deux routes ont des auteurs et des
 * moyens de paiement différents. Les confondre sous un même point d'entrée
 * obligerait chaque appelant à vérifier s'il a le droit d'écrire ce qu'il
 * envoie, et la règle se retrouverait dupliquée côté client.
 *
 * Le montant, lui, n'est pas transmis : c'est celui du devis accepté. Le
 * technicien constate un encaissement, il n'en fixe pas le montant.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(_request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    const result = await declareCashCollection(auth, id, {
      channel: "CASH",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    console.error("Declare cash collection error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la déclaration de l'encaissement" },
      { status: 500 }
    );
  }
}