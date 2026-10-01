import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

import { PASSWORD_LENGTH } from "./roles";

/** Longueur du mot de passe demandé à l'inscription. */
export { PASSWORD_LENGTH };

const KEY_LENGTH = 32;

/** Un mot de passe est valide s'il contient exactement 4 chiffres. */
export function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && new RegExp(`^\\d{${PASSWORD_LENGTH}}$`).test(password);
}

/**
 * Empreinte d'un mot de passe : `scrypt` avec un sel aléatoire, au format
 * `sel:empreinte` (hex). Aucun champ de mot de passe n'est stocké en clair.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `${salt}:${derived}`;
}

/** Vérifie un mot de passe face à une empreinte `sel:empreinte`. */
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;

  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;

  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(expected, "hex"));
}