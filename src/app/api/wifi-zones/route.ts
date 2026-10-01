import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";

/** Résout le dossier client du propriétaire à partir du jeton d'accès. */
async function getClientIdOf(userId: string): Promise<string | null> {
  const client = await prisma.client.findFirst({
    where: { userId },
    select: { id: true },
  });

  return client?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    if (auth.role === "CLIENT") {
      // Un propriétaire ne voit que ses propres zones.
      const ownClientId = await getClientIdOf(auth.userId);

      if (!ownClientId) {
        return NextResponse.json({ data: [] });
      }

      if (clientId && clientId !== ownClientId) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }

      const zones = await prisma.wifiZone.findMany({
        where: { clientId: ownClientId },
        include: { client: true, equipments: true },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ data: zones });
    }

    // Admin et technicien voient toutes les zones (filtre optionnel).
    const zones = await prisma.wifiZone.findMany({
      where: clientId ? { clientId } : {},
      include: { client: true, equipments: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: zones });
  } catch (error) {
    console.error("Get wifi zones error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des zones WiFi" },
      { status: 500 }
    );
  }
}

/**
 * Ajout d'une zone Wi-Fi par son propriétaire. Le dossier client est déduit du
 * jeton : un propriétaire peut ainsi gérer plusieurs zones depuis l'application.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (auth.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Seul un propriétaire de zone peut ajouter une zone" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const location = typeof body?.location === "string" ? body.location.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "Le nom de la zone est requis" },
        { status: 400 }
      );
    }

    const clientId = await getClientIdOf(auth.userId);

    if (!clientId) {
      return NextResponse.json(
        { error: "Aucun dossier client associé à ce compte" },
        { status: 403 }
      );
    }

    const wifiZone = await prisma.wifiZone.create({
      data: {
        clientId,
        name,
        location: location || name,
      },
      include: { client: true, equipments: true },
    });

    return NextResponse.json({ data: wifiZone }, { status: 201 });
  } catch (error) {
    console.error("Create wifi zone error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la zone WiFi" },
      { status: 500 }
    );
  }
}