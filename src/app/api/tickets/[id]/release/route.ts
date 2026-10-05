import { NextRequest, NextResponse } from "next/server";

import { getApiUser } from "@/lib/api-auth";
import { releaseTicket } from "@/lib/tickets";

/**
 * Le technicien remet une demande dans le circuit.
 *
 * Action de terrain, donc décidée sur le terrain : le technicien a accepté puis
 * ne peut plus y aller. La demande n'est pas annulée pour autant — elle retourne
 * chez les techniciens disponibles.
 *
 * Le contrôle des droits est délégué à `lib/tickets.ts`, comme pour le statut et
 * le rapport d'intervention : trois chemins qui décrivent la même intervention
 * doivent accorder exactement les mêmes droits, sinon une demande pourrait être
 * rendue par un chemin et refusée par un autre.
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

    const result = await releaseTicket({ userId: auth.userId, role: auth.role }, id);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("Release ticket error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la remise de la demande" },
      { status: 500 }
    );
  }
}