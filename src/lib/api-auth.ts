import { NextRequest, NextResponse } from "next/server";
import { verify } from "jsonwebtoken";

import type { AppRole } from "./roles";

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "default-secret-key";

export type ApiUser = {
  userId: string;
  phone: string;
  role: AppRole;
};

/**
 * Vérifie le header `Authorization: Bearer <accessToken>` émis par POST /api/auth/login.
 * Utilisé par les routes qui écrivent des données (création de ticket, upload de
 * fichiers, lecture du profil courant).
 */
export function getApiUser(request: NextRequest): ApiUser | null {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  try {
    const payload = verify(token, JWT_SECRET) as Partial<ApiUser>;

    if (!payload.userId) {
      return null;
    }

    return {
      userId: payload.userId,
      phone: payload.phone || "",
      role: payload.role || "CLIENT",
    };
  } catch {
    return null;
  }
}

/**
 * Vérifie le jeton et exige le rôle technicien.
 *
 * Les routes de répartition — présence, offres, réponse — n'ont aucun sens pour
 * un client ni pour la régie : ce sont les toutes premières vérifications d'un
 * jeton valide et d'un compte technicien, écrites une fois pour qu'aucune de
 * ces routes ne les oublie.
 *
 * Renvoie l'utilisateur, ou le refus à renvoyer tel quel par l'appelant.
 */
export function requireTechnician(request: NextRequest):
  | { ok: true; user: ApiUser }
  | { ok: false; response: NextResponse } {
  const auth = getApiUser(request);

  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }

  if (auth.role !== "TECHNICIAN") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Réservé aux techniciens." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user: auth };
}
