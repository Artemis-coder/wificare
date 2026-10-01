import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Enregistrement du jeton de push d'un appareil.
 *
 * L'application mobile appelle cette route à chaque connexion réussie, puis à
 * chaque démarrage : un jeton Firebase peut être renouvelé à la réinstallation
 * ou au changement d'appareil, et le serveur doit détenir le jeton valide le
 * plus récent, sans quoi la notification partirait dans le vide.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const platform = typeof body?.platform === "string" ? body.platform : "android";

    if (!token) {
      return NextResponse.json(
        { error: "Le jeton de notification est requis" },
        { status: 400 }
      );
    }

    // `token` est unique : ré-enregistrer le même appareil met simplement à
    // jour le propriétaire, ce qui évite les doublons quand l'application
    // s'est réinstallée en gardant le même jeton.
    await prisma.pushToken.upsert({
      where: { token },
      create: {
        token,
        userId: auth.userId,
        platform,
      },
      update: {
        userId: auth.userId,
        platform,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({ data: { registered: true } });
  } catch (error) {
    console.error("Register push token error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement du jeton" },
      { status: 500 }
    );
  }
}

/**
 * Retrait du jeton de l'appareil appelant.
 *
 * Appelé à la déconnexion : sans cela, le téléphone continuerait de recevoir
 * les notifications de la demande d'un compte dont il est sorti.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (token) {
      await prisma.pushToken.deleteMany({
        where: { token, userId: auth.userId },
      });
    }

    return NextResponse.json({ data: { unregistered: true } });
  } catch (error) {
    console.error("Unregister push token error:", error);
    return NextResponse.json(
      { error: "Erreur lors du retrait du jeton" },
      { status: 500 }
    );
  }
}
