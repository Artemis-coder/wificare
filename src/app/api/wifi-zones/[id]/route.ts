import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { deleteZone, updateZone } from "@/lib/zones";

/**
 * Modification et suppression d'une Wi-Fi Zone.
 *
 * Les règles vivent dans `lib/zones`, comme pour la déclaration : cette route ne
 * fait que porter le jeton Bearer jusqu'à elles. Le web passe par des server
 * actions et arrive au même endroit, donc les deux écrans appliquent exactement
 * les mêmes refus.
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

    const { id } = await params;
    const body = await request.json();

    const result = await updateZone(
      { userId: auth.userId, role: auth.role },
      id,
      body ?? {}
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("Update wifi zone error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la modification de la zone WiFi" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    const result = await deleteZone(
      { userId: auth.userId, role: auth.role },
      id
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("Delete wifi zone error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la zone WiFi" },
      { status: 500 }
    );
  }
}

/** Zones d'un dossier client : utilisé par l'application mobile. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(_request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    const zone = await prisma.wifiZone.findUnique({
      where: { id },
      include: { client: true, equipments: true },
    });

    if (!zone) {
      return NextResponse.json({ error: "WiFi Zone introuvable" }, { status: 404 });
    }

    if (auth.role !== "SUPER_ADMIN" && zone.client.userId !== auth.userId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    return NextResponse.json({ data: zone });
  } catch (error) {
    console.error("Get wifi zone error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de la zone WiFi" },
      { status: 500 }
    );
  }
}