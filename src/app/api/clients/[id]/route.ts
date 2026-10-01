import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        wifiZones: {
          include: {
            equipments: true,
          },
        },
        user: true,
        tickets: {
          include: {
            technician: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    return NextResponse.json({ data: client });
  } catch (error) {
    console.error("Get client error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du client" },
      { status: 500 }
    );
  }
}
