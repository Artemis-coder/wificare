import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";

/**
 * Profil de l'utilisateur authentifié. Pour un client, résout aussi son dossier
 * Client (et ses zones Wi-Fi) à partir de `Client.userId`, ce qui permet à
 * l'application mobile de ne plus deviner son profil avec `GET /api/clients`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const client = await prisma.client.findFirst({
      where: { userId: user.id },
      include: {
        wifiZones: { include: { equipments: true }, orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
        },
        client,
      },
    });
  } catch (error) {
    console.error("Get me error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du profil" },
      { status: 500 }
    );
  }
}
