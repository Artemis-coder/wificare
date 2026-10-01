import { sign } from "jsonwebtoken";

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "default-secret-key";

export type TokenUser = {
  id: string;
  phone: string;
  role: "ADMIN" | "TECHNICIAN" | "CLIENT";
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

/** JWT d'accès (7 jours) et de rafraîchissement (30 jours) d'un compte. */
export function signTokens(user: TokenUser): TokenPair {
  return {
    accessToken: sign(
      { userId: user.id, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    ),
    refreshToken: sign({ userId: user.id, type: "refresh" }, JWT_SECRET, {
      expiresIn: "30d",
    }),
  };
}