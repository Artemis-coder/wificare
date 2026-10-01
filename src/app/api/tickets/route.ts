import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { Prisma, Priority, TicketStatus, NotificationType } from "@prisma/client";
import { adminIds, notify, soleTechnicianId } from "@/lib/notifications";

const PRIORITIES = Object.values(Priority);

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
export async function POST(request: NextRequest) {
  try {
    const auth = getApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { wifiZoneId, type, priority, description, scheduledFor } = body;

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

    const resolvedPriority = PRIORITIES.includes(priority) ? priority : Priority.NORMAL;

    // Un client ne peut créer un ticket que pour son propre compte.
    const client = zone.client;
    if (
      auth.role === "CLIENT" &&
      client.userId &&
      client.userId !== auth.userId
    ) {
      return NextResponse.json(
        { error: "Vous n'êtes pas autorisé à créer une demande pour ce client" },
        { status: 403 }
      );
    }

    const count = await prisma.ticket.count();
    const reference = `#TK-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

    // Tant qu'un seul technicien est en service, la demande lui revient
    // automatiquement : personne d'autre ne pourrait la traiter.
    const soleTechnician = await soleTechnicianId();

    const ticket = await prisma.ticket.create({
      data: {
        reference,
        type,
        priority: resolvedPriority,
        status: soleTechnician ? TicketStatus.ASSIGNED : TicketStatus.NEW,
        description: description || null,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        clientId: client.id,
        wifiZoneId: zone.id,
        technicianId: soleTechnician,
      },
      include: {
        client: true,
        wifiZone: true,
        technician: true,
      },
    });

    // Affectation automatique : le technicien est prévenu, le client aussi.
    // Sinon la demande attend une répartition par la régie.
    if (soleTechnician) {
      const technician = ticket.technician;

      await notify({
        userIds: [soleTechnician],
        type: NotificationType.TICKET_ASSIGNED,
        title: "Nouvelle intervention assignée",
        body: `${ticket.reference} · ${zone.name} — ${type}. Elle vous a été attribuée automatiquement.`,
        ticketId: ticket.id,
      });

      if (client.userId) {
        await notify({
          userIds: [client.userId],
          type: NotificationType.TICKET_ASSIGNED,
          title: "Demande transmise au technicien",
          body: `${ticket.reference} a été transmise à ${technician?.name ?? "un technicien"}.`,
          ticketId: ticket.id,
        });
      }
    } else {
      await notify({
        userIds: await adminIds(),
        type: NotificationType.TICKET_SUBMITTED,
        title: "Nouvelle demande à répartir",
        body: `${ticket.reference} · ${client.name} · ${zone.name} — ${type}.`,
        ticketId: ticket.id,
      });
    }

    return NextResponse.json({ data: ticket }, { status: 201 });
  } catch (error) {
    console.error("Create ticket error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du ticket" },
      { status: 500 }
    );
  }
}
