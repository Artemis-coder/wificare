/**
 * Audiences d'un message de la régie : ce qu'elles s'appellent, ce qu'elles
 *coversent, et comment les nommer au milieu d'une phrase.
 *
 * Ces trois tables sont pures — aucun accès à la base — et vivent à part de
 * `lib/broadcast` pour une raison précise : l'interface s'en sert pour composer
 * ses phrases (« partira pour les propriétaires de zone »), alors que
 * `lib/broadcast` tire Prisma et les notifications. L'importer depuis un
 * composant client y embarquerait le serveur.
 */

/** Audiences proposées. Chacune est un ensemble de rôles, pas une liste de comptes. */
export const BROADCAST_AUDIENCES = {
  ALL: "ALL",
  CLIENTS: "CLIENTS",
  TECHNICIANS: "TECHNICIANS",
  STAFF: "STAFF",
} as const;

export type BroadcastAudience =
  (typeof BROADCAST_AUDIENCES)[keyof typeof BROADCAST_AUDIENCES];

export const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  ALL: "Tout le monde",
  CLIENTS: "Propriétaires de zone",
  TECHNICIANS: "Techniciens",
  STAFF: "Équipe d'administration",
};

export const AUDIENCE_HINT: Record<BroadcastAudience, string> = {
  ALL: "Clients, techniciens et équipe d'administration.",
  CLIENTS: "Les propriétaires de zone, qui commandent et paient les interventions.",
  TECHNICIANS: "Les techniciens, qui interviennent sur le terrain.",
  STAFF: "Vous et les autres comptes de super administrateur.",
};

/**
 * L'audience nommée pour tenir au milieu d'une phrase.
 *
 * Un intitulé se colle mal à une préposition : « pour Propriétaires de zone »
 * n'est pas français, là où « pour les propriétaires de zone » l'est. Les
 * trois tables ne dérivent donc pas l'une de l'autre.
 */
export const AUDIENCE_PHRASE: Record<BroadcastAudience, string> = {
  ALL: "tout le monde",
  CLIENTS: "les propriétaires de zone",
  TECHNICIANS: "les techniciens",
  STAFF: "l'équipe d'administration",
};

export function isBroadcastAudience(value: unknown): value is BroadcastAudience {
  return (
    typeof value === "string" &&
    (Object.values(BROADCAST_AUDIENCES) as readonly string[]).includes(value)
  );
}