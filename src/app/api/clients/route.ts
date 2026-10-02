import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { isSuperAdmin } from "@/lib/roles";

/**
 * Annuaire des dossiers clients, paginé.
 *
 * Réservé à la super administration : un dossier client agrège les coordonnées
 * de son propriétaire, ses zones, ses équipements et ses demandes. Ce n'est pas
 * le profil d'un client sur lui-même — un client ne se voit que par ses propres
 * zones et ses propres demandes.
 *
 * Le compte lié au dossier est renvoyé sans son empreinte de mot de passe :
 * `user: true` la ferait apparaître dans la réponse.
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        include: {
          wifiZones: true,
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
              status: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.client.count(),
    ]);

    return NextResponse.json({
      data: {
        items: clients,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get clients error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des clients" },
      { status: 500 }
    );
  }
}