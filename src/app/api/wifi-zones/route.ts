import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { clientIdForUser, createZone } from "@/lib/zones";

/**
 * Zones Wi-Fi.
 *
 * Le propriétaire ne voit que ses zones, le super administrateur tout le parc.
 * Une zone déclarée naît en attente de validation : c'est le super
 * administrateur qui décide qu'elle entre dans le parc exploitable.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    if (auth.role === "CLIENT") {
      const ownClientId = await clientIdForUser(auth.userId);

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

    if (auth.role === "TECHNICIAN") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Super administrateur : tout le parc, avec filtre optionnel sur le
    // propriétaire et sur le statut de validation.
    const zones = await prisma.wifiZone.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        ...(status === "PENDING" || status === "ACTIVE" ? { status } : {}),
      },
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
 * Déclaration d'une zone par son propriétaire.
 *
 * Le dossier client est déduit du jeton : un propriétaire peut ainsi gérer
 * plusieurs zones depuis l'application. La zone est créée en attente de
 * validation, et le super administrateur en est prévenu.
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
    const clientId = await clientIdForUser(auth.userId);

    if (!clientId) {
      return NextResponse.json(
        { error: "Aucun dossier client associé à ce compte" },
        { status: 403 }
      );
    }

    const result = await createZone(clientId, {
      name: body?.name,
      location: body?.location,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const zone = await prisma.wifiZone.findUnique({
      where: { id: result.data.id },
      include: { client: true, equipments: true },
    });

    return NextResponse.json({ data: zone }, { status: 201 });
  } catch (error) {
    console.error("Create wifi zone error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la zone WiFi" },
      { status: 500 }
    );
  }
}