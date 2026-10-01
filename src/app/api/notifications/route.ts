import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Notifications du compte connecté.
 *
 * Une notification est strictement personnelle : on ne lit que les siennes.
 * La réponse contient le nombre de non-lus, pour le badge de l'application.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const unreadOnly = searchParams.get("unread") === "true";

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: auth.userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: auth.userId, readAt: null },
      }),
    ]);

    return NextResponse.json({
      data: { items, unreadCount },
    });
  } catch (error) {
    console.error("List notifications error:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des notifications" },
      { status: 500 }
    );
  }
}

/** Marque toutes les notifications du compte comme lues. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = getApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const result = await prisma.notification.updateMany({
      where: { userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ data: { markedAsRead: result.count } });
  } catch (error) {
    console.error("Mark notifications read error:", error);
    return NextResponse.json(
      { error: "Erreur lors du marquage des notifications" },
      { status: 500 }
    );
  }
}