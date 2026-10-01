/**
 * Rôles de la plateforme et règles d'accès associées.
 *
 * La source de vérité reste l'enum `Role` de `prisma/schema.prisma`. Ce module
 * Centralise ce que l'interface et l'API doivent savoir d'un rôle : son libellé
 * utilisateur, les types de compte proposés à la connexion, les rights de la
 * navigation web et les prédicats utilisés par les routes API.
 */

import type { Role } from "@prisma/client";

/** Rôles stockés en base. */
export type AppRole = Role;

/**
 * Types de compte proposés sur l'écran de connexion. Ce ne sont pas des rôles :
 * c'est ce que l'utilisateur *prétend* être, afin que le serveur refuse un
 * compte qui ne correspond pas. `WIFI_ZONE_OWNER` correspond au rôle `CLIENT`.
 */
export const ACCOUNT_TYPES = [
  "SUPER_ADMIN",
  "ADMIN",
  "TECHNICIAN",
  "WIFI_ZONE_OWNER",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Rôle attendu en base pour chaque type de compte. */
export const ACCOUNT_TYPE_ROLE: Record<AccountType, AppRole> = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  TECHNICIAN: "TECHNICIAN",
  WIFI_ZONE_OWNER: "CLIENT",
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  TECHNICIAN: "Technicien",
  WIFI_ZONE_OWNER: "Propriétaire de zone",
};

export const ACCOUNT_TYPE_HINT: Record<AccountType, string> = {
  SUPER_ADMIN: "Gère les comptes et toute la plateforme",
  ADMIN: "Répartit les demandes et suit l'exploitation",
  TECHNICIAN: "Intervient sur les demandes assignées",
  WIFI_ZONE_OWNER: "Déclare et suit les pannes de ses zones",
};

export function isAccountType(value: unknown): value is AccountType {
  return (
    typeof value === "string" &&
    (ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Longueur du mot de passe de compte (4 chiffres).
 *
 * Défini ici et non dans `lib/password` : l'écran de connexion en a besoin pour
 * guider la saisie, et `lib/password` importe `crypto`, interdit côté client.
 */
export const PASSWORD_LENGTH = 4;

export const ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  TECHNICIAN: "Technicien",
  CLIENT: "Propriétaire de zone",
};

/** Message d'erreur affiché quand le type choisi ne correspond pas au compte. */
export function accountTypeMismatchMessage(expected: AppRole): string {
  switch (expected) {
    case "SUPER_ADMIN":
      return "Ce compte n'est pas un compte super administrateur.";
    case "ADMIN":
      return "Ce compte n'est pas un compte administrateur.";
    case "TECHNICIAN":
      return "Ce compte n'est pas un compte technicien.";
    default:
      return "Ce compte n'est pas un compte propriétaire de zone.";
  }
}

// ----------------------------------------
// Droits
// ----------------------------------------

/** Rôles qui administrent la plateforme (SUPER_ADMIN englobe ADMIN). */
export const STAFF_ROLES: readonly AppRole[] = ["SUPER_ADMIN", "ADMIN"];

/** Seuls les super administrateurs gèrent les comptes, les rôles et les statuts. */
export const isSuperAdmin = (role: AppRole | null | undefined): boolean =>
  role === "SUPER_ADMIN";

/** Vrai pour les rôles qui administrent la plateforme. */
export const isStaff = (role: AppRole | null | undefined): boolean =>
  role != null && STAFF_ROLES.includes(role);

// ----------------------------------------
// Navigation web
// ----------------------------------------

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Rôles autorisés à voir l'entrée. Absent = tous les rôles connectés. */
  roles?: readonly AppRole[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: "dashboard" },
  { href: "/tickets", label: "Tickets", icon: "tickets" },
  {
    href: "/admin/utilisateurs",
    label: "Utilisateurs",
    icon: "users",
    roles: ["SUPER_ADMIN"],
  },
  { href: "/zones", label: "Wi-Fi Zones", icon: "zones" },
  { href: "/invoices", label: "Factures & Paiements", icon: "invoices" },
  { href: "/profile", label: "Mon Profil", icon: "profile" },
];

/** Entrées de navigation visibles par un rôle donné. */
export function navItemsFor(role: AppRole | null | undefined): NavItem[] {
  if (!role) return [];

  return NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role)
  );
}
