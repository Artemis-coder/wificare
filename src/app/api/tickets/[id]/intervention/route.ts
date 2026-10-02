import { NextRequest, NextResponse } from "next/server";

import { getApiUser } from "@/lib/api-auth";
import { reportIntervention, updateIntervention } from "@/lib/interventions";

/**
 * Rapport d'intervention d'une demande.
 *
 * Cette route ne décide rien : elle porte le jeton Bearer jusqu'à
 * `lib/interventions`, qui refuse l'écriture à quiconque n'est pas le technicien
 * affecté ou la super administration. Le contrôle est donc le même que celui du
 * statut de la demande — les deux décrivent la même intervention.
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
    const data = await request.json();

    const result = await reportIntervention(auth, id, data ?? {});

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    console.error("Create intervention error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'intervention" },
      { status: 500 }
    );
  }
}

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
    const data = await request.json();

    const result = await updateIntervention(auth, id, data ?? {});

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("Update intervention error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'intervention" },
      { status: 500 }
    );
  }
}