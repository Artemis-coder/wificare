/**
 * Rôles de la plateforme et règles d'accès associées.
 *
 * La source de vérité reste l'enum `Role` de `prisma/schema.prisma`. Ce module
 * centralise ce que l'interface et l'API doivent savoir d'un rôle : son libellé
 * utilisateur, les types de compte proposés à la connexion, les rights de la
 * navigation web et les prédicats utilisés par les routes API.
 *
 * La plateforme compte trois profils : le technicien qui intervient, le
 * propriétaire de Wi-Fi Zone qui déclare ses pannes, et le super administrateur
 * qui gère l'ensemble. Le rôle `ADMIN` a été fusionné dans `SUPER_ADMIN` : les
 * deux profils désignaient la même régie, les séparer ne produisait qu'une
 * frontière à maintenir sans différence de droits réelle.
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
  "TECHNICIAN",
  "WIFI_ZONE_OWNER",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Rôle attendu en base pour chaque type de compte. */
export const ACCOUNT_TYPE_ROLE: Record<AccountType, AppRole> = {
  SUPER_ADMIN: "SUPER_ADMIN",
  TECHNICIAN: "TECHNICIAN",
  WIFI_ZONE_OWNER: "CLIENT",
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  SUPER_ADMIN: "Super administrateur",
  TECHNICIAN: "Technicien",
  WIFI_ZONE_OWNER: "Propriétaire de zone",
};

export const ACCOUNT_TYPE_HINT: Record<AccountType, string> = {
  SUPER_ADMIN: "Gère toute la plateforme : comptes, zones et interventions",
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
  TECHNICIAN: "Technicien",
  CLIENT: "Propriétaire de zone",
};

/**
 * Tous les rôles, dans l'ordre d'affichage.
 *
 * Les écrans qui proposent un choix de rôle le parcourent plutôt que de
 * redéclarer la liste : la fusion des profils d'administration a déjà rendu
 * stale la moitié de ces listes, et il n'y a plus de place pour une troisième.
 */
export const APP_ROLES: readonly AppRole[] = ["SUPER_ADMIN", "TECHNICIAN", "CLIENT"];

/** Message d'erreur affiché quand le type choisi ne correspond pas au compte. */
export function accountTypeMismatchMessage(expected: AppRole): string {
  switch (expected) {
    case "SUPER_ADMIN":
      return "Ce compte n'est pas un compte super administrateur.";
    case "TECHNICIAN":
      return "Ce compte n'est pas un compte technicien.";
    default:
      return "Ce compte n'est pas un compte propriétaire de zone.";
  }
}

// ----------------------------------------
// Droits
// ----------------------------------------

/**
 * Rôles qui administrent la plateforme.
 *
 * La régie n'a plus qu'un seul profil : tout ce qui relevait de `ADMIN` relève
 * désormais de `SUPER_ADMIN`, y compris la gestion des comptes et des zones.
 */
export const STAFF_ROLES: readonly AppRole[] = ["SUPER_ADMIN"];

/** Seuls les super administrateurs gèrent les comptes, les rôles et les statuts. */
export const isSuperAdmin = (role: AppRole | null | undefined): boolean =>
  role === "SUPER_ADMIN";

/**
 * Vrai pour le rôle qui administre la plateforme.
 *
 * Alias d'`isSuperAdmin` : les deux noms disent la même chose depuis la fusion,
 * mais « staff » reste le terme employé par les écrans de régie et « super
 * admin » celui des écrans de gestion de comptes. Les garder évite de
 * réécrire les gardes existants et de chercher lequel employer.
 */
export const isStaff = (role: AppRole | null | undefined): boolean =>
  isSuperAdmin(role);

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
  {
    href: "/admin/avis",
    label: "Avis clients",
    icon: "reviews",
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/admin/notifications",
    label: "Notifications",
    icon: "bell",
    roles: ["SUPER_ADMIN"],
  },
  { href: "/zones", label: "Wi-Fi Zones", icon: "zones", roles: ["SUPER_ADMIN", "CLIENT"] },
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
