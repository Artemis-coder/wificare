import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Marque une notification comme lue, ou la supprime.
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
/**
 * Supprime une notification.
 *
 * Seules les notifications **lues** se suppriment. Une notification encore non
 * lue porte une information que l'utilisateur n'a pas encore prise en compte ;
 * la supprimer lui retirerait un fait de la plateforme sans qu'il l'ait vu, et
 * le compteur de non-lus ne pourrait plus rien signaler. Le refus vaut `409` :
 * l'écran propose d'abord « Tout lire », et la suppression devient alors
 * possible.
 *
 * La suppression est réelle et non un drapeau : une notification effacée n'a
 * plus de place à garder. Le `where` reprend le contrôle du propriétaire.
 */
export async function DELETE(
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
      select: { id: true, readAt: true },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notification introuvable" },
        { status: 404 }
      );
    }

    if (notification.readAt === null) {
      return NextResponse.json(
        { error: "Marquez la notification comme lue avant de la supprimer" },
        { status: 409 }
      );
    }

    await prisma.notification.delete({ where: { id: notification.id } });

    return NextResponse.json({ data: { id: notification.id } });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la notification" },
      { status: 500 }
    );
  }
}
