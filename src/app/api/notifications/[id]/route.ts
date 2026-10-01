import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Marque une notification comme lue.
 *
 * Le `where` combine l'identifiant et le propriétaire : une notification
 * d'autrui renvoie un 404, pas un 403 — on ne confirme pas son existence.
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

    const notification = await prisma.notification.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notification introuvable" },
        { status: 404 }
      );
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return NextResponse.json(
      { error: "Erreur lors du marquage de la notification" },
      { status: 500 }
    );
  }
}