import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { arrivalEstimateFrom, destinationOf } from "@/lib/geo";
import { notifyTrackingUpdate } from "@/lib/push";

/**
 * Intervalle minimal entre deux notifications de suivi pour une même demande.
 *
 * Le technicien émet un point toutes les quelques secondes ; prévenir le client à
 * chaque point noierait son téléphone de notifications pour une information qui
 * ne change que de peu. Deux minutes suffisent à garder un compte à rebours
 * vivant sans le rendre agressif.
 */
const PUSH_THROTTLE_MS = 2 * 60 * 1000;

/** Extrait un nombre fini du corps, ou `null` si le champ est absent ou invalide. */
function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Déclare au client que le technicien vient d'envoyer une position.
 *
 * Le premier point est toujours annoncé : c'est lui qui fait apparaître le
 * suivi à l'écran, et le client ignore alors encore qu'un technicien existe. Les
 * suivants sont bridés, et un envoi sauté n'est pas une anomalie — c'est le
 * fonctionnement nominal d'un suivi régulier. L'appel est isolé du reste pour
 * qu'un push en échec n'entraîne pas la perte du point de position.
 */
async function announceTracking(
  clientUserId: string | null,
  payload: {
    ticketId: string;
    reference: string;
    etaMinutes: number | null;
    distanceMeters: number | null;
  },
  previousRecordedAt: Date | null
): Promise<void> {
  if (!clientUserId) {
    return;
  }

  if (
    previousRecordedAt &&
    Date.now() - previousRecordedAt.getTime() < PUSH_THROTTLE_MS
  ) {
    return;
  }

  try {
    await notifyTrackingUpdate([clientUserId], payload);
  } catch (error) {
    console.error("Tracking update push error:", error);
  }
}

/**
 * Enregistre la position du technicien affecté à une demande.
 *
 * Réservé au technicien concerné : un autre technicien, ou un client, ne peut
 * pas se substituer à lui dans le suivi que voit le commanditaire. La position
 * est le plus souvent envoyée alors que le téléphone est en mouvement et que la
 * connexion est mauvaise : la route ne doit donc jamais être lente à répondre.
 *
 * Une seule ligne est conservée par demande (`ticketId` unique) et écrasée à
 * chaque point : l'historique n'aurait aucun usage, et le client ne veut que la
 * position courante. La distance et l'ETA sont recalculées et stockées à chaque
 * point, pour que le push n'ait pas à refaire un calcul de géolocalisation.
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

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { wifiZone: true, client: { select: { userId: true } } },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    if (ticket.technicianId !== auth.userId) {
      return NextResponse.json(
        { error: "Cette demande ne vous est pas affectée" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    // Un point hors bornes donnerait une distance calculable mais fausse, donc
    // une ETA fausse affichée au client : mieux vaut refuser l'enregistrement.
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

    const destination = destinationOf(ticket.wifiZone);
    const estimate = arrivalEstimateFrom({
      technician: { latitude, longitude },
      destination,
    });

    // Ligne précédente lue avant l'écriture : elle porte le `recordedAt` qui
    // sert de référence au bridage des notifications.
    const previous = await prisma.technicianTracking.findUnique({
      where: { ticketId: ticket.id },
      select: { recordedAt: true },
    });

    const tracking = await prisma.technicianTracking.upsert({
      where: { ticketId: ticket.id },
      create: {
        ticketId: ticket.id,
        technicianId: auth.userId,
        latitude,
        longitude,
        accuracy: optionalNumber(body?.accuracy),
        speed: optionalNumber(body?.speed),
        heading: optionalNumber(body?.heading),
        distanceMeters: estimate.distanceMeters,
        etaMinutes: estimate.etaMinutes,
        recordedAt: new Date(),
      },
      update: {
        technicianId: auth.userId,
        latitude,
        longitude,
        accuracy: optionalNumber(body?.accuracy),
        speed: optionalNumber(body?.speed),
        heading: optionalNumber(body?.heading),
        distanceMeters: estimate.distanceMeters,
        etaMinutes: estimate.etaMinutes,
        recordedAt: new Date(),
        // Un nouveau point signifie que le technicien reprend le suivi : la
        // ligne doit donc redevenir active, sinon l'écran resterait figé sur
        // « suivi arrêté ».
        stoppedAt: null,
      },
    });

    // Le point est déjà enregistré à ce stade : l'envoi ne peut plus le perdre,
    // et il est isolé pour ne pas interrompre la réponse au technicien.
    await announceTracking(
      ticket.client.userId,
      {
        ticketId: ticket.id,
        reference: ticket.reference,
        etaMinutes: tracking.etaMinutes,
        distanceMeters: tracking.distanceMeters,
      },
      previous?.recordedAt ?? null
    );

    return NextResponse.json({
      data: {
        ticketId: tracking.ticketId,
        distanceMeters: tracking.distanceMeters,
        etaMinutes: tracking.etaMinutes,
        destination,
        startedAt: tracking.startedAt,
        recordedAt: tracking.recordedAt,
      },
    });
  } catch (error) {
    console.error("Update ticket tracking error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de la position" },
      { status: 500 }
    );
  }
}

/**
 * État du suivi de position d'une demande.
 *
 * Lisible par le client — c'est lui qui suit l'arrivée — par le technicien
 * affecté, et par la régie qui doit pouvoir constater qu'un suivi est en
 * cours. La réponse est stable même sans aucune ligne : l'application a besoin
 * de savoir qu'il n'y a rien à afficher, ce qui n'est pas la même chose qu'une
 * erreur.
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

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { client: { select: { userId: true } }, wifiZone: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    const allowed =
      isStaff(auth.role) ||
      ticket.technicianId === auth.userId ||
      ticket.client.userId === auth.userId;

    if (!allowed) {
      return NextResponse.json(
        { error: "Vous n'êtes pas autorisé à consulter ce suivi" },
        { status: 403 }
      );
    }

    const tracking = await prisma.technicianTracking.findUnique({
      where: { ticketId: ticket.id },
    });

    if (!tracking) {
      return NextResponse.json({ data: { active: false } });
    }

    return NextResponse.json({
      data: {
        active: tracking.stoppedAt === null,
        latitude: tracking.latitude,
        longitude: tracking.longitude,
        accuracy: tracking.accuracy,
        speed: tracking.speed,
        heading: tracking.heading,
        distanceMeters: tracking.distanceMeters,
        etaMinutes: tracking.etaMinutes,
        destination: destinationOf(ticket.wifiZone),
        startedAt: tracking.startedAt,
        recordedAt: tracking.recordedAt,
        stoppedAt: tracking.stoppedAt,
      },
    });
  } catch (error) {
    console.error("Get ticket tracking error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du suivi" },
      { status: 500 }
    );
  }
}
