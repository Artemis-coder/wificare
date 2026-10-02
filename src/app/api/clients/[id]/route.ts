import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { isSuperAdmin } from "@/lib/roles";
import { PUBLIC_USER_SELECT } from "@/lib/user-public";

/**
 * Dossier client : zones, équipements, demandes récentes.
 *
 * Réservé à la super administration. Le compte lié est renvoyé sans son empreinte
 * de mot de passe — `user: true` la ferait apparaître dans la réponse.
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

    if (!isSuperAdmin(auth.role)) {
      return NextResponse.json(
        { error: "Réservé au super administrateur" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        wifiZones: {
          include: {
            equipments: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            status: true,
          },
        },
        tickets: {
          include: {
            technician: { select: PUBLIC_USER_SELECT },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    return NextResponse.json({ data: client });
  } catch (error) {
    console.error("Get client error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du client" },
      { status: 500 }
    );
  }
}