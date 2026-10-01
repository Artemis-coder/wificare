import { NextRequest } from "next/server";
import { verify } from "jsonwebtoken";

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "default-secret-key";

export type ApiUser = {
  userId: string;
  phone: string;
  role: "ADMIN" | "TECHNICIAN" | "CLIENT";
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
