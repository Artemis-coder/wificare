import { NotificationType, ZoneStatus } from "@prisma/client";

import { prisma } from "./prisma";
import { isSuperAdmin, STAFF_ROLES, type AppRole } from "./roles";
import { notify } from "./notifications";

/**
 * Cycle de vie des Wi-Fi Zones.
 *
 * Une zone n'existe pas seulement parce que son propriétaire l'a déclarée : elle
 * entre dans le parc exploité après validation du super administrateur. Ce module
 * porte la règle pour les deux chemins d'écriture — les server actions du
 * back-office et les routes REST de l'application mobile — sinon l'un des deux
 * permettrait de valider ce que l'autre refuse.
 */

/** Résultat d'une opération : succès avec la donnée, ou refus motivé. */
export type ZoneResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

const fail = <T>(error: string, status: number): ZoneResult<T> => ({
  ok: false,
  error,
  status,
});

/** Zone telle que renvoyée aux écrans et à l'API, propriétaire inclus. */
export type ZoneWithOwner = {
  id: string;
  name: string;
  location: string;
  status: ZoneStatus;
  createdAt: Date;
  client: { id: string; name: string; contact: string };
};

const ZONE_INCLUDE = {
  client: { select: { id: true, name: true, contact: true } },
} as const;

/** Auteur d'une opération sur une zone, avec les droits qui en découlent. */
export type ZoneActor = { userId: string; role: AppRole };

/**
 * Zones visibles par un rôle.
 *
 * Le super administrateur voit tout le parc, tous propriétaires confondus :
 * c'est le seul écran depuis lequel on valide, corrige ou supprime une zone, et
 * il doit donc pouvoir les retrouver. Un propriétaire ne voit que ses propres
 * zones, un technicien aucune : il travaille sur des demandes, pas sur un
 * annuaire de zones.
 *
 * Les zones en attente de validation passent en tête : ce sont elles qui
 * attendent une action, et les burying en bas de liste les faisait oublier.
 */
export async function listZonesFor(actor: ZoneActor): Promise<ZoneWithOwner[]> {
  if (actor.role === "TECHNICIAN") {
    return [];
  }

  if (isSuperAdmin(actor.role)) {
    return prisma.wifiZone.findMany({
      include: ZONE_INCLUDE,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  const clientId = await clientIdForUser(actor.userId);

  if (!clientId) {
    return [];
  }

  return prisma.wifiZone.findMany({
    where: { clientId },
    include: ZONE_INCLUDE,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

/**
 * Zones dont la validation est en attente, tous propriétaires confondus.
 *
 * C'est la file de travail du super administrateur : une zone déclarée attend
 * d'être validée avant de pouvoir recevoir une demande d'intervention.
 */
export async function pendingZoneCount(): Promise<number> {
  return prisma.wifiZone.count({ where: { status: "PENDING" } });
}

export type ZoneInput = {
  name?: unknown;
  location?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

export type ZonePatch = ZoneInput & {
  status?: unknown;
};

function readText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value.trim() : undefined;
}

function readCoordinate(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Déclare une zone pour un propriétaire.
 *
 * La zone naît `PENDING` : le propriétaire renseigne ce qu'il connaît, et c'est
 * le super administrateur qui décide qu'elle entre dans le parc. Une déclaration
 * faite par la régie passe par `createZoneAsStaff` et entre directement en
 * exploitation, faute de propriétaire à attendre une validation.
 */
export async function createZone(
  clientId: string,
  input: ZoneInput
): Promise<ZoneResult<ZoneWithOwner>> {
  return insertZone(clientId, input, ZoneStatus.PENDING);
}

/** Déclaration d'une zone par le super administrateur : déjà validée. */
export async function createZoneAsStaff(
  clientId: string,
  input: ZoneInput
): Promise<ZoneResult<ZoneWithOwner>> {
  return insertZone(clientId, input, ZoneStatus.ACTIVE);
}

async function insertZone(
  clientId: string,
  input: ZoneInput,
  status: ZoneStatus
): Promise<ZoneResult<ZoneWithOwner>> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, userId: true },
  });

  if (!client) {
    return fail("Dossier client introuvable.", 404);
  }

  const name = readText(input.name) ?? "";
  const location = readText(input.location) ?? "";

  if (!name) {
    return fail("Le nom de la zone est requis.", 400);
  }

  const zone = await prisma.wifiZone.create({
    data: {
      clientId,
      name,
      location: location || name,
      status,
      latitude: readCoordinate(input.latitude) ?? null,
      longitude: readCoordinate(input.longitude) ?? null,
    },
    include: ZONE_INCLUDE,
  });

  if (status === ZoneStatus.PENDING) {
    await notify({
      userIds: await superAdminIds(),
      type: NotificationType.ZONE_SUBMITTED,
      title: "Wi-Fi Zone à valider",
      body: `${zone.name} — ${zone.client.name} vient d'être déclarée et attend sa validation.`,
    });

    if (client.userId) {
      await notify({
        userIds: [client.userId],
        type: NotificationType.ZONE_SUBMITTED,
        title: "Zone transmise à la plateforme",
        body: `La zone ${zone.name} a été déclarée. Elle sera utilisable dès sa validation.`,
      });
    }
  }

  return { ok: true, data: zone };
}

/**
 * Modifie une zone.
 *
 * Le super administrateur corrige une zone de n'importe quel propriétaire, y
 * compris une zone déjà en exploitation : le nom affiché sur un bon de commande
 * vaut souvent plus que le nom réel du quartier. Un propriétaire ne peut
 * corriger que sa propre zone, et seulement tant qu'elle est en attente : passé
 * la validation, la fiche fait foi pour tous les autres.
 */
export async function updateZone(
  actor: ZoneActor,
  zoneId: string,
  patch: ZonePatch
): Promise<ZoneResult<ZoneWithOwner>> {
  const zone = await prisma.wifiZone.findUnique({
    where: { id: zoneId },
    include: ZONE_INCLUDE,
  });

  if (!zone) {
    return fail("Wi-Fi Zone introuvable.", 404);
  }

  if (!isSuperAdmin(actor.role) && !(await ownsZone(actor.userId, zone.clientId))) {
    return fail("Vous ne pouvez modifier que vos propres zones.", 403);
  }

  if (!isSuperAdmin(actor.role) && zone.status === ZoneStatus.ACTIVE) {
    return fail(
      "Cette zone est validée : adressez-vous au super administrateur pour la modifier.",
      403
    );
  }

  const data: {
    name?: string;
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
    status?: ZoneStatus;
  } = {};

  const name = readText(patch.name);
  if (name !== undefined) {
    if (!name) {
      return fail("Le nom de la zone ne peut pas être vide.", 400);
    }
    data.name = name;
  }

  const location = readText(patch.location);
  if (location !== undefined) {
    if (!location) {
      return fail("L'emplacement ne peut pas être vidé.", 400);
    }
    data.location = location;
  }

  const latitude = readCoordinate(patch.latitude);
  if (latitude !== undefined) {
    data.latitude = latitude;
  }

  const longitude = readCoordinate(patch.longitude);
  if (longitude !== undefined) {
    data.longitude = longitude;
  }

  if (patch.status !== undefined) {
    if (!isSuperAdmin(actor.role)) {
      return fail("Réservé au super administrateur.", 403);
    }

    if (!Object.values(ZoneStatus).includes(patch.status as ZoneStatus)) {
      return fail("Statut de zone inconnu.", 400);
    }

    data.status = patch.status as ZoneStatus;
  }

  if (Object.keys(data).length === 0) {
    return fail("Aucune modification demandée.", 400);
  }

  const updated = await prisma.wifiZone.update({
    where: { id: zoneId },
    data,
    include: ZONE_INCLUDE,
  });

  await announceValidation(actor, updated);

  return { ok: true, data: updated };
}

/**
 * Supprime définitivement une zone.
 *
 * Réservée au super administrateur, et refusée si des demandes lui sont
 * rattachées : une zone supprimée emporterait l'historique des interventions
 * qu'elle a générées, et cet historique est la seule chose qui dise qui est
 * intervenu, quand, et pour quoi. Retirer une zone sans trace ferait disparaître
 * des interventions réelles d'un dossier client.
 */
export async function deleteZone(
  actor: ZoneActor,
  zoneId: string
): Promise<ZoneResult<{ id: string }>> {
  if (!isSuperAdmin(actor.role)) {
    return fail("Réservé au super administrateur.", 403);
  }

  const zone = await prisma.wifiZone.findUnique({
    where: { id: zoneId },
    include: ZONE_INCLUDE,
  });

  if (!zone) {
    return fail("Wi-Fi Zone introuvable.", 404);
  }

  const tickets = await prisma.ticket.count({ where: { wifiZoneId: zoneId } });

  if (tickets > 0) {
    return fail(
      `Cette zone porte ${tickets} demande(s) : son historique ne peut pas être supprimé.`,
      409
    );
  }

  await prisma.wifiZone.delete({ where: { id: zoneId } });

  await notify({
    userIds: await ownerUserIdOf(zone.client.id),
    type: NotificationType.ZONE_DELETED,
    title: "Wi-Fi Zone supprimée",
    body: `La zone ${zone.name} a été supprimée de la plateforme.`,
  });

  return { ok: true, data: { id: zoneId } };
}

/** Prévient le propriétaire quand le statut de sa zone change. */
async function announceValidation(
  actor: ZoneActor,
  zone: ZoneWithOwner
): Promise<void> {
  if (!isSuperAdmin(actor.role)) {
    return;
  }

  const validated = zone.status === ZoneStatus.ACTIVE;

  await notify({
    userIds: await ownerUserIdOf(zone.client.id),
    type: NotificationType.ZONE_VALIDATED,
    title: validated ? "Zone validée" : "Zone retirée du parc",
    body: validated
      ? `${zone.name} est validée : vous pouvez désormais signaler une panne.`
      : `${zone.name} n'est plus validée par la plateforme.`,
  });
}

/** Vrai si l'utilisateur est le propriétaire de la zone, via son dossier client. */
async function ownsZone(userId: string, clientId: string): Promise<boolean> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    select: { id: true },
  });

  return client !== null;
}

/** Compte propriétaire d'un dossier client, ou tableau vide s'il n'y en a pas. */
async function ownerUserIdOf(clientId: string): Promise<string[]> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { userId: true },
  });

  return client?.userId ? [client.userId] : [];
}

async function superAdminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: { id: true },
  });

  return admins.map((admin) => admin.id);
}

/**
 * Dossier client d'un compte propriétaire.
 *
 * `null` pour un compte sans dossier : l'appelant doit alors refuser l'opération
 * plutôt que d'agir sur un dossier arbitraire.
 */
export async function clientIdForUser(userId: string): Promise<string | null> {
  const client = await prisma.client.findFirst({
    where: { userId },
    select: { id: true },
  });

  return client?.id ?? null;
}