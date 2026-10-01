import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Liste des avis d'intervention.
 *
 * Chaque rôle voit ce qui le concerne : un client ses avis déposés, un
 * technicien ceux qu'il a reçus, la régie tous. Un avis engage les deux
 * parties, il n'est donc pas public — un client ne doit pas pouvoir lire ce
 * que les autres ont pensé d'un technicien donné.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const technicianId = searchParams.get("technicianId");
    const ticketId = searchParams.get("ticketId");

    let scope: Prisma.EvaluationWhereInput = {};

    if (auth.role === "CLIENT") {
      scope = { clientId: auth.userId };
    } else if (auth.role === "TECHNICIAN") {
      scope = { technicianId: auth.userId };
    }

    const evaluations = await prisma.evaluation.findMany({
      where: {
        AND: [
          scope,
          ...(technicianId ? [{ technicianId }] : []),
          ...(ticketId ? [{ ticketId }] : []),
        ],
      },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        technician: { select: { id: true, name: true, phone: true } },
        ticket: {
          select: {
            id: true,
            reference: true,
            type: true,
            status: true,
            wifiZone: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: evaluations });
  } catch (error) {
    console.error("Get evaluations error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des avis" },
      { status: 500 }
    );
  }
}