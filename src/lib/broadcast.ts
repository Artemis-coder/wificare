import { BroadcastStatus, NotificationType, Role, UserStatus } from "@prisma/client";

import { prisma } from "./prisma";
import { notify } from "./notifications";
import { devicesSubscribedFor } from "./push";

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
 *
 * Résolu à l'envoi et non à la programmation : l'équipe change d'ici là, et
 * c'est la composition au moment du départ qui est la bonne.
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

/** Longueur des champs, calée sur ce que le téléphone sait afficher. */
export const TITLE_MAX = 80;
export const BODY_MAX = 240;

export type BroadcastInput = {
  audience: BroadcastAudience;
  title: string;
  body: string;
};

export type BroadcastResult =
  | { ok: true; recipients: number; devices: number }
  | { ok: false; error: string };

type Validated = { ok: true; title: string; body: string } | { ok: false; error: string };

/** Vérifie le titre et le message, comme le serveur le fera à l'envoi. */
function validate(input: BroadcastInput): Validated {
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

  return { ok: true, title, body };
}

/**
 * Enregistre une campagne et l'envoie tout de suite.
 *
 * L'écriture précède l'envoi : une campagne partie dont la ligne manquerait
 * serait invisible dans l'historique et dans les indicateurs, et l'écran
 * afficherait « en attente » pour un message déjà distribué.
 */
export async function sendBroadcastNow(
  input: BroadcastInput,
  authorId: string
): Promise<BroadcastResult> {
  const validated = validate(input);

  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      title: validated.title,
      body: validated.body,
      audience: input.audience,
      scheduledFor: new Date(),
      createdById: authorId,
    },
    select: { id: true },
  });

  const dispatched = await dispatchBroadcast(broadcast.id);

  if (!dispatched.ok) {
    return dispatched;
  }

  return { ok: true, recipients: dispatched.recipients, devices: dispatched.devices };
}

/**
 * Programme une campagne pour plus tard.
 *
 * L'heure est stockée en UTC, à partir de l'heure locale saisie par la régie :
 * l'affichage la reconvertit dans le fuseau du navigateur, donc une campagne
 * programmée depuis un autre fuseau s'affiche à l'heure locale de celui qui la
 * regarde.
 */
export async function scheduleBroadcast(
  input: BroadcastInput & { scheduledFor: Date },
  authorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validate(input);

  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  if (Number.isNaN(input.scheduledFor.getTime())) {
    return { ok: false, error: "La date d'envoi est illisible." };
  }

  // Tolérance d'une minute : certaines saisies tombent à la seconde juste, et
  // une campagne programmée « maintenant » doit partir, pas rester en attente
  // jusqu'au prochain passage du déclencheur.
  if (input.scheduledFor.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "La date d'envoi est déjà passée." };
  }

  const audience = await audienceUserIds(input.audience);

  if (audience.length === 0) {
    return { ok: false, error: "Aucun compte actif ne correspond à cette audience." };
  }

  await prisma.broadcast.create({
    data: {
      title: validated.title,
      body: validated.body,
      audience: input.audience,
      scheduledFor: input.scheduledFor,
      createdById: authorId,
    },
  });

  return { ok: true };
}

/** Annule une campagne programmée. Sans effet si elle est déjà partie. */
export async function cancelBroadcast(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // La condition sur l'état fait office de garde : une campagne partie entre
  // l'affichage de la liste et ce clic ne peut plus être annulée, et surtout pas
  // réémise.
  const cancelled = await prisma.broadcast.updateMany({
    where: { id, status: BroadcastStatus.SCHEDULED },
    data: { status: BroadcastStatus.CANCELLED },
  });

  if (cancelled.count === 0) {
    return { ok: false, error: "Cette campagne n'est plus en attente d'envoi." };
  }

  return { ok: true };
}

/** Envoie sans attendre l'heure une campagne programmée. */
export async function sendBroadcastNowById(
  id: string
): Promise<BroadcastResult> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    select: { status: true, scheduledFor: true },
  });

  if (!broadcast) {
    return { ok: false, error: "Campagne introuvable." };
  }

  // Une campagne en attente est ramenée à l'heure du jour pour que le
  // déclencheur la réclame au prochain passage.
  if (broadcast.status === BroadcastStatus.SCHEDULED) {
    await prisma.broadcast.update({
      where: { id },
      data: { scheduledFor: new Date() },
    });
  }

  const dispatched = await dispatchBroadcast(id);

  if (!dispatched.ok) {
    return dispatched;
  }

  return { ok: true, recipients: dispatched.recipients, devices: dispatched.devices };
}

/**
 * Envoie une campagne et passe son état à `SENT` ou `FAILED`.
 *
 * L'écriture de claim est conditionnelle à l'état : deux déclencheurs qui se
 * recoupent — une action de régie et le balayage programmé — n'enverront le
 * message qu'une fois, le second voyant la ligne déjà après `SENDING`.
 */
async function dispatchBroadcast(id: string): Promise<BroadcastResult> {
  const claimed = await prisma.broadcast.updateMany({
    where: { id, status: BroadcastStatus.SCHEDULED },
    data: { status: BroadcastStatus.SENDING },
  });

  if (claimed.count === 0) {
    return { ok: false, error: "Cette campagne a déjà été traitée." };
  }

  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    select: { title: true, body: true, audience: true },
  });

  if (!broadcast || !isBroadcastAudience(broadcast.audience)) {
    await failBroadcast(id, "Audience illisible.");

    return { ok: false, error: "Audience illisible." };
  }

  const recipients = await audienceUserIds(broadcast.audience);

  if (recipients.length === 0) {
    await failBroadcast(
      id,
      "Aucun compte actif ne correspond à cette audience au moment de l'envoi."
    );

    return { ok: false, error: "Aucun compte actif ne correspond à cette audience." };
  }

  const devices = await devicesSubscribedFor(recipients);

  try {
    // `notify` crée une notification par destinataire puis déclenche les push
    // FCM et Web Push : c'est exactement le chemin des notifications métier.
    // L'écriture est faite par lots, une campagne à plusieurs centaines de
    // destinataires ne tiendrait pas dans une seule transaction.
    for (let index = 0; index < recipients.length; index += 100) {
      await notify({
        userIds: recipients.slice(index, index + 100),
        type: NotificationType.BROADCAST,
        title: broadcast.title,
        body: broadcast.body,
      });
    }
  } catch (error) {
    await failBroadcast(id, error instanceof Error ? error.message : "Envoi interrompu.");

    throw error;
  }

  await prisma.broadcast.update({
    where: { id },
    data: {
      status: BroadcastStatus.SENT,
      sentAt: new Date(),
      recipients: recipients.length,
      devices,
      failureReason: null,
    },
  });

  return { ok: true, recipients: recipients.length, devices };
}

async function failBroadcast(id: string, reason: string) {
  await prisma.broadcast.update({
    where: { id },
    data: { status: BroadcastStatus.FAILED, failureReason: reason },
  });
}

/**
 * Envoie les campagnes dont l'heure est atteinte.
 *
 * Appelé par un déclencheur extérieur : le plan d'hébergement courant ne
 * permet qu'une tâche par jour, ce qui est incompatible avec une campagne prévue
 * à 14 h. La garantie obtenue est donc « dans les minutes qui suivent l'heure
 * prévue », et non « à la seconde » — c'est pourquoi l'écran affiche l'heure
 * programmée et son état, plutôt que de laisser croire à une exactitude.
 */
export async function dispatchDueBroadcasts(
  limit = 50
): Promise<{ dispatched: number; failed: number }> {
  const due = await prisma.broadcast.findMany({
    where: {
      status: BroadcastStatus.SCHEDULED,
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    select: { id: true },
  });

  let dispatched = 0;
  let failed = 0;

  for (const row of due) {
    try {
      const result = await dispatchBroadcast(row.id);

      if (result.ok) {
        dispatched += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { dispatched, failed };
}

export type BroadcastRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  scheduledFor: string;
  sentAt: string | null;
  status: BroadcastStatus;
  recipients: number;
  /** `null` si la campagne est antérieure à la mesure du push. */
  devices: number | null;
  failureReason: string | null;
};

/** Campagnes en attente d'envoi, prochaine exécution en tête. */
export async function scheduledBroadcasts(limit = 20): Promise<BroadcastRow[]> {
  const rows = await prisma.broadcast.findMany({
    where: { status: BroadcastStatus.SCHEDULED },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  return rows.map(toRow);
}

/** Dernières campagnes, toutes issues confondues. */
export async function recentBroadcasts(limit = 20): Promise<BroadcastRow[]> {
  const rows = await prisma.broadcast.findMany({
    orderBy: [{ scheduledFor: "desc" }],
    take: limit,
  });

  return rows.map(toRow);
}

function toRow(row: {
  id: string;
  title: string;
  body: string;
  audience: string;
  scheduledFor: Date;
  sentAt: Date | null;
  status: BroadcastStatus;
  recipients: number;
  devices: number | null;
  failureReason: string | null;
}): BroadcastRow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    scheduledFor: row.scheduledFor.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    status: row.status,
    recipients: row.recipients,
    devices: row.devices,
    failureReason: row.failureReason,
  };
}

export type BroadcastStats = {
  /** Campagnes parties. */
  sent: number;
  /** Campagnes qui attendent leur heure. */
  pending: number;
  cancelled: number;
  failed: number;
  /** Destinataires cumulés des campagnes parties. */
  recipients: number;
  /** Téléphones cumulés des campagnes parties, 0 si aucune n'a été mesurée. */
  devices: number;
  /** Vrai si au moins une campagne a relevé son nombre de téléphones. */
  devicesMeasured: boolean;
  /** Comptes actifs, pour situer la couverture du push. */
  activeAccounts: number;
  /** Dont joignables hors application. */
  subscribedAccounts: number;
  /** Prochaine exécution programmée, si elle existe. */
  nextScheduledAt: string | null;
  /** Date du dernier envoi. */
  lastSentAt: string | null;
  /** Envoi moyen par campagne, pour lire si l'audience est en train de changer. */
  averageRecipients: number;
};

/**
 * Chiffres de la campagne, toutes dates confondues.
 *
 * Les destinataires et les téléphones sont ceux mesurés **à l'envoi** : un
 * compte créé après une campagne n'y est pas compté, et un compte désactivé
 * depuis l'est toujours. Les cumuler donnerait un faux présent.
 */
export async function broadcastStats(): Promise<BroadcastStats> {
  const [grouped, next, activeAccounts, subscribedAccounts, lastSent] =
    await Promise.all([
      prisma.broadcast.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { recipients: true, devices: true },
      }),
      // Prochaine exécution : même requête que le compteur « en attente », donc
      // une seule fois.
      prisma.broadcast.findFirst({
        where: { status: BroadcastStatus.SCHEDULED },
        orderBy: { scheduledFor: "asc" },
        select: { scheduledFor: true },
      }),
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.user.count({
        where: { status: UserStatus.ACTIVE, pushTokens: { some: {} } },
      }),
      prisma.broadcast.findFirst({
        where: { status: BroadcastStatus.SENT },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);

  const byStatus = new Map(grouped.map((row) => [row.status, row]));

  const sent = byStatus.get(BroadcastStatus.SENT);
  const recipients = sent?._sum.recipients ?? 0;
  const devices = sent?._sum.devices ?? 0;
  const sentCount = sent?._count._all ?? 0;
  // Une campagne antérieure à la console n'a pas relevé ses téléphones. La
  // somme les ignore, et `devicesMeasured` permet à l'écran de ne pas afficher
  // un « 0 » qui dirait « personne n'a été touché ».
  const devicesMeasured = grouped.some((row) => row._sum.devices !== null);

  return {
    sent: sentCount,
    pending: byStatus.get(BroadcastStatus.SCHEDULED)?._count._all ?? 0,
    cancelled: byStatus.get(BroadcastStatus.CANCELLED)?._count._all ?? 0,
    failed: byStatus.get(BroadcastStatus.FAILED)?._count._all ?? 0,
    recipients,
    devices,
    devicesMeasured,
    activeAccounts,
    subscribedAccounts,
    nextScheduledAt: next?.scheduledFor.toISOString() ?? null,
    lastSentAt: lastSent?.sentAt?.toISOString() ?? null,
    averageRecipients: sentCount === 0 ? 0 : Math.round(recipients / sentCount),
  };
}