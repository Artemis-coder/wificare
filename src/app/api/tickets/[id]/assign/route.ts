import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { assignTicket } from "@/lib/tickets";
import { isStaff } from "@/lib/roles";

/**
 * Affecte un technicien à une demande.
 *
 * Réservée à la régie : affecter quelqu'un est une décision d'encadrement, pas
 * une action de terrain. Un technicien ne peut donc pas s'attribuer une demande,
 * ni affecter un collègue. La régie est composée des administrateurs et des
 * super administrateurs.
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

    if (!isStaff(auth.role)) {
      return NextResponse.json(
        { error: "Seul un administrateur peut affecter un technicien" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { technicianId } = await request.json();

    if (!technicianId) {
      return NextResponse.json(
        { error: "Le technicien est requis" },
        { status: 400 }
      );
    }

    const result = await assignTicket(id, technicianId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("Assign ticket error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'affectation du ticket" },
      { status: 500 }
    );
  }
}
