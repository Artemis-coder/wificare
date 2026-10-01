import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        include: {
          wifiZones: true,
          user: true,
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
