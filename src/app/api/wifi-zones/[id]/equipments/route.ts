import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const equipments = await prisma.equipment.findMany({
      where: { wifiZoneId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: equipments });
  } catch (error) {
    console.error("Get equipments error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des équipements" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { type, brand, model, serialNumber } = await request.json();

    const equipment = await prisma.equipment.create({
      data: {
        wifiZoneId: id,
        type,
        brand,
        model,
        serialNumber,
      },
    });

    return NextResponse.json({ data: equipment });
  } catch (error) {
    console.error("Create equipment error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'équipement" },
      { status: 500 }
    );
  }
}
