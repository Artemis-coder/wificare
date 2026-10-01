import { NextRequest, NextResponse } from "next/server";

import { getApiUser } from "@/lib/api-auth";
import { ROLE_LABEL } from "@/lib/roles";
import { denyUnlessSuperAdminApi, updateUser } from "@/lib/user-admin";

/**
 * Modification d'un compte par le super administrateur (API).
 *
 * Trois actions : changer le rôle, changer le statut (activation, suspension)
 * et réinitialiser le mot de passe. Les règles et leurs refus vivent dans
 * `lib/user-admin`, partagés avec les server actions de l'interface web.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = denyUnlessSuperAdminApi(request);
  if (denied) return denied;

  try {
    const auth = getApiUser(request);
    const { id } = await params;

    const result = await updateUser(auth!.userId, id, await request.json());

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      data: { ...result.data, roleLabel: ROLE_LABEL[result.data.role] },
    });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la modification du compte" },
      { status: 500 }
    );
  }
}
