import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { Prisma, TicketStatus } from "@prisma/client";
import { createTicket } from "@/lib/tickets";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status");
    const technicianId = searchParams.get("technicianId");
    const clientId = searchParams.get("clientId");

    const where: Prisma.TicketWhereInput = {};
    if (status) where.status = status as TicketStatus;
    if (technicianId) where.technicianId = technicianId;
    if (clientId) where.clientId = clientId;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          client: true,
          wifiZone: true,
          technician: true,
          intervention: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.ticket.count({ where }),
    ]);

    return NextResponse.json({
      data: {
        items: tickets,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get tickets error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des tickets" },
      { status: 500 }
    );
  }
}

/**
 * Création d'une demande d'intervention par un client depuis l'application mobile.
 * Le client est déduit de l'utilisateur authentifié (ou du wifiZoneId fourni),
 * ce qui évite au client mobile de devoir DEVINER son propre Client comme le
 * faisait l'ancienne version (`getClients().data[0]`).
 */
/**
 * Création d'une demande d'intervention par un client depuis l'application mobile.
 * Le client est déduit de l'utilisateur authentifié (ou du wifiZoneId fourni),
 * ce qui évite au client mobile de devoir DEVINER son propre Client comme le
 * faisait l'ancienne version (`getClients().data[0]`).
 *
 * La répartition elle-même est partagée avec l'interface web : une demande
 * créée depuis un téléphone et une demande créée depuis le back-office
 * suivent exactement le même chemin.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { wifiZoneId, type, priority, description } = body;

    if (!wifiZoneId || !type) {
      return NextResponse.json(
        { error: "La zone Wi-Fi et le type d'intervention sont requis" },
        { status: 400 }
      );
    }

    const zone = await prisma.wifiZone.findUnique({
      where: { id: wifiZoneId },
      include: { client: true },
    });

    if (!zone) {
      return NextResponse.json({ error: "Wi-Fi Zone introuvable" }, { status: 404 });
    }

    // Un client ne peut créer un ticket que pour son propre compte.
    if (
      auth.role === "CLIENT" &&
      zone.client.userId &&
      zone.client.userId !== auth.userId
    ) {
      return NextResponse.json(
        { error: "Vous n'êtes pas autorisé à créer une demande pour ce client" },
        { status: 403 }
      );
    }

    const result = await createTicket({
      wifiZoneId,
      type,
      priority,
      description,
      clientId: zone.clientId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    console.error("Create ticket error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du ticket" },
      { status: 500 }
    );
  }
}
