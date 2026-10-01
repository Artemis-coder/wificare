import { NotificationType, Role, UserStatus } from "@prisma/client";

import { prisma } from "./prisma";
import { notify } from "./notifications";

/**
 * Messages de la régie à toute la plateforme.
 *
 * Le cycle de vie d'une demande ne couvre qu'une partie de ce qu'il faut
 * annoncer : une coupure du réseau sur plusieurs zones, une maintenance
 * planifiée, un incident général. Ces messages n'ont ni demande ni technicien
 * associé, et doivent pouvoir partir d'un seul geste depuis le back-office,
 * sans passer par la console Firebase.
 *
 * Ils empruntent le même chemin que les notifications métier — `notify`, donc
 * in-app, push Android et Web Push — afin qu'un message de la régie apparaisse
 * exactement comme un changement de statut, sans second circuit à maintenir.
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
  STAFF: "Vous et l'autre compte d'encadrement.",
};

export function isBroadcastAudience(value: unknown): value is BroadcastAudience {
  return (
    typeof value === "string" &&
    (Object.values(BROADCAST_AUDIENCES) as readonly string[]).includes(value)
  );
}

/** Rôles correspondant à une audience. */
function rolesFor(audience: BroadcastAudience): Role[] {
  switch (audience) {
    case BROADCAST_AUDIENCES.CLIENTS:
      return ["CLIENT"];
    case BROADCAST_AUDIENCES.TECHNICIANS:
      return ["TECHNICIAN"];
    case BROADCAST_AUDIENCES.STAFF:
      return ["SUPER_ADMIN", "ADMIN"];
    default:
      return ["CLIENT", "TECHNICIAN", "SUPER_ADMIN", "ADMIN"];
  }
}

/**
 * Destinataires d'une audience.
 *
 * Seuls les comptes actifs sont visés : notifier un compte désactivé ou
 * suspendu enverrait un message à quelqu'un qui n'a plus accès à la plateforme.
 */
export async function audienceUserIds(
  audience: BroadcastAudience
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: rolesFor(audience) }, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

export type BroadcastInput = {
  audience: BroadcastAudience;
  title: string;
  body: string;
  /** Demande liée, pour que la notification mène à son détail. */
  ticketId?: string;
};

export type BroadcastResult =
  | { ok: true; recipients: number }
  | { ok: false; error: string };

/** Longueur des champs, calée sur ce que le téléphone sait afficher. */
const TITLE_MAX = 80;
const BODY_MAX = 240;

/**
 * Envoie un message de la régie à une audience.
 *
 * L'écriture est faite par lots : une campagne à plusieurs centaines de
 * destinataires tiendrait mal dans une seule transaction, et une erreur en
 * cours de route ferait perdre le message entier. Les destinataires sont donc
 * traités par groupes, les envois push démarrant après chaque écriture.
 */
export async function sendBroadcast(
  input: BroadcastInput
): Promise<BroadcastResult> {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) {
    return { ok: false, error: "Le titre est obligatoire." };
  }

  if (!body) {
    return { ok: false, error: "Le message est obligatoire." };
  }

  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Le titre ne doit pas dépasser ${TITLE_MAX} caractères.` };
  }

  if (body.length > BODY_MAX) {
    return { ok: false, error: `Le message ne doit pas dépasser ${BODY_MAX} caractères.` };
  }

  const recipients = await audienceUserIds(input.audience);

  if (recipients.length === 0) {
    return { ok: false, error: "Aucun compte actif ne correspond à cette audience." };
  }

  // `notify` crée une notification par destinataire puis déclenche les push
  // FCM et Web Push : c'est exactement le chemin des notifications métier.
  for (let index = 0; index < recipients.length; index += 100) {
    await notify({
      userIds: recipients.slice(index, index + 100),
      type: NotificationType.BROADCAST,
      title,
      body,
      ticketId: input.ticketId,
    });
  }

  return { ok: true, recipients: recipients.length };
}

/** Dernières campagnes envoyées, pour garder une trace de ce qui a été dit. */
export async function recentBroadcasts(limit = 10) {
  const rows = await prisma.notification.findMany({
    where: { type: NotificationType.BROADCAST },
    orderBy: { createdAt: "desc" },
    take: limit * 6,
    select: { id: true, title: true, body: true, createdAt: true, userId: true },
  });

  // Une campagne produit une notification par destinataire : on la regroupe par
  // titre et instant pour n'afficher qu'une ligne par envoi, avec son nombre de
  // destinataires.
  const grouped = new Map<string, { id: string; title: string; body: string; createdAt: Date; recipients: number }>();

  for (const row of rows) {
    const key = `${row.title}|${row.createdAt.toISOString()}`;

    const existing = grouped.get(key);

    if (existing) {
      existing.recipients += 1;
      continue;
    }

    grouped.set(key, {
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      recipients: 1,
    });
  }

  return [...grouped.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}