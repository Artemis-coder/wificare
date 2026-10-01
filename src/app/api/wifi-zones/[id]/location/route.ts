import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";

/**
 * Position de la zone, relevée par son propriétaire.
 *
 * C'est cette position qui sert de destination au calcul d'ETA : sans elle, le
 * client qui attend son technicien ne peut voir qu'un technicien sur une carte,
 * sans heure d'arrivée. Seul le propriétaire de la zone peut donc la
 * renseigner — son téléphone est le seul à savoir où elle se trouve — la régie
 * restant autorisée à corriger une saisie erronée.
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

    const zone = await prisma.wifiZone.findUnique({
      where: { id },
      include: { client: { select: { userId: true } } },
    });

    if (!zone) {
      return NextResponse.json({ error: "Wi-Fi Zone introuvable" }, { status: 404 });
    }

    // La position détermine l'heure annoncée au client : elle n'est modifiable
    // que par celui à qui appartient la zone, ou par la régie.
    if (!isStaff(auth.role) && zone.client.userId !== auth.userId) {
      return NextResponse.json(
        { error: "Vous n'êtes pas autorisé à modifier cette zone" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    // Un relevé hors bornes produirait une distance plausible mais fausse, donc
    // une ETA fausse : mieux vaut refuser la requête que l'accepter.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: "Latitude et longitude doivent être des nombres" },
        { status: 400 }
      );
    }

    if (latitude < -90 || latitude > 90) {
      return NextResponse.json(
        { error: "La latitude doit être comprise entre -90 et 90" },
        { status: 400 }
      );
    }

    if (longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: "La longitude doit être comprise entre -180 et 180" },
        { status: 400 }
      );
    }

    await prisma.wifiZone.update({
      where: { id: zone.id },
      data: { latitude, longitude },
    });

    return NextResponse.json({ data: { latitude, longitude } });
  } catch (error) {
    console.error("Update wifi zone location error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de la position" },
      { status: 500 }
    );
  }
}
