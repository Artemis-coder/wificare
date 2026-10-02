import { NotificationType, TicketStatus } from "@prisma/client";

import { prisma } from "./prisma";
import { notify } from "./notifications";
import { loadWritableTicket, type TicketActor, type TicketResult } from "./tickets";

/**
 * Rapport d'intervention : diagnostic, solution, points de contrôle, durée.
 *
 * Ce que le technicien a constaté sur place est un fait : ce n'est pas une
 * procédure d'approbation, et le client doit pouvoir le lire tel quel. En
 * revanche ce rapport décrit une intervention précise, sur une installation
 * précise : il n'a de sens que pour le technicien affecté à cette demande, ou
 * pour la super administration qui encadre l'intervention. Un client n'écrit
 * pas le rapport de sa propre panne, et aucun compte ne décrit celle d'autrui.
 *
 * Les règles vivent ici, pas dans la route : l'application mobile et le
 * back-office doivent accorder les mêmes droits sur la même donnée.
 */

const fail = <T>(error: string, status: number): TicketResult<T> => ({
  ok: false,
  error,
  status,
});

/** Longueurs bornées : un rapport se lit sur un téléphone, pas dans un dossier. */
const TEXT_MAX = 2000;
const DURATION_MAX = 24 * 60;

/**
 * Statuts depuis lesquels la rédaction du rapport fait passer la demande en
 * diagnostic.
 *
 * Seuls les statuts qui précèdent le diagnostic sont concernés. Repartir en
 * diagnostic depuis une demande terminée ou clôturée ferait rouvrir
 * silencieusement un dossier que le client a déjà soldé.
 */
const DIAGNOSABLE_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.TO_VERIFY,
  TicketStatus.ASSIGNED,
  TicketStatus.CONFIRMED,
  TicketStatus.EN_ROUTE,
];

export type InterventionInput = {
  checklist?: unknown;
  diagnostic?: unknown;
  solution?: unknown;
  durationMin?: unknown;
};

export type InterventionReport = {
  id: string;
  ticketId: string;
  checklist: Record<string, boolean> | null;
  diagnostic: string | null;
  solution: string | null;
  durationMin: number | null;
};

/** Colonnes renvoyées au client : ni `createdAt` ni rien qui n'est pas lisible. */
const REPORT_SELECT = {
  id: true,
  ticketId: true,
  checklist: true,
  diagnostic: true,
  solution: true,
  durationMin: true,
} as const;

/**
 * Relit la colonne `checklist`.
 *
 * `checklist` est une colonne `Json`, donc Prisma la rend comme un `JsonValue`
 * dont rien ne garantit la forme. Les lignes écrites avant ce durcissement
 * peuvent contenir n'importe quoi : ne garder que les entrées réellement
 * booléennes évite qu'un objet arbitraire devienne le contenu affiché au client.
 */
function toReport(row: {
  id: string;
  ticketId: string;
  checklist: unknown;
  diagnostic: string | null;
  solution: string | null;
  durationMin: number | null;
}): InterventionReport {
  const checklist: Record<string, boolean> = {};

  if (row.checklist !== null && typeof row.checklist === "object") {
    for (const [key, value] of Object.entries(
      row.checklist as Record<string, unknown>
    )) {
      if (typeof value === "boolean") {
        checklist[key] = value;
      }
    }
  }

  return {
    id: row.id,
    ticketId: row.ticketId,
    checklist: Object.keys(checklist).length > 0 ? checklist : null,
    diagnostic: row.diagnostic,
    solution: row.solution,
    durationMin: row.durationMin,
  };
}

/**
 * Champs du rapport, lus explicitement.
 *
 * Le corps de la requête n'est jamais étalé dans l'écriture : le rapport partage
 * sa table avec un `id` et un `createdAt`, et un étalement laisserait un appelant
 * écrire l'identifiant d'un autre rapport, ou une ligne qu'il n'a pas les
 * droits de créer.
 */
function readInput(input: InterventionInput): {
  data: {
    checklist?: Record<string, boolean>;
    diagnostic?: string;
    solution?: string;
    durationMin?: number;
  };
  changed: boolean;
} {
  const data: {
    checklist?: Record<string, boolean>;
    diagnostic?: string;
    solution?: string;
    durationMin?: number;
  } = {};

  if (input.checklist !== undefined) {
    if (input.checklist === null) {
      data.checklist = {};
    } else {
      if (typeof input.checklist !== "object" || Array.isArray(input.checklist)) {
        throw new InterventionInputError(
          "Les points de contrôle doivent être une liste de contrôles vrai ou faux."
        );
      }

      const checklist: Record<string, boolean> = {};

      for (const [key, value] of Object.entries(input.checklist)) {
        if (typeof value !== "boolean") {
          throw new InterventionInputError(
            `Le point de contrôle « ${key} » doit être vrai ou faux.`
          );
        }
        checklist[key] = value;
      }

      data.checklist = checklist;
    }
  }

  if (input.diagnostic !== undefined) {
    if (typeof input.diagnostic !== "string") {
      throw new InterventionInputError("Le diagnostic doit être un texte.");
    }

    const trimmed = input.diagnostic.trim();

    if (trimmed.length > TEXT_MAX) {
      throw new InterventionInputError(
        `Le diagnostic ne peut pas dépasser ${TEXT_MAX} caractères.`
      );
    }

    data.diagnostic = trimmed;
  }

  if (input.solution !== undefined) {
    if (typeof input.solution !== "string") {
      throw new InterventionInputError("La solution doit être un texte.");
    }

    const trimmed = input.solution.trim();

    if (trimmed.length > TEXT_MAX) {
      throw new InterventionInputError(
        `La solution ne peut pas dépasser ${TEXT_MAX} caractères.`
      );
    }

    data.solution = trimmed;
  }

  if (input.durationMin !== undefined && input.durationMin !== null) {
    const duration =
      typeof input.durationMin === "number"
        ? input.durationMin
        : Number(input.durationMin);

    if (!Number.isFinite(duration) || duration < 0 || duration > DURATION_MAX) {
      throw new InterventionInputError(
        "La durée doit être un nombre de minutes compris entre 0 et 1440."
      );
    }

    data.durationMin = Math.round(duration);
  }

  return { data, changed: Object.keys(data).length > 0 };
}

/** Erreur d'entrée, distinguée de la panne technique pour renvoyer un `400`. */
class InterventionInputError extends Error {}

/** Regroupe les refus de saisie pour éviter un `try/catch` par champ. */
function normalizeInput(input: InterventionInput) {
  try {
    return { ok: true as const, ...readInput(input) };
  } catch (error) {
    if (error instanceof InterventionInputError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}

/**
 * Ouvre le rapport d'une intervention.
 *
 * La rédaction du rapport signifie que le technicien est en train de diagnostiquer :
 * la demande passe alors en `DIAGNOSING`, sauf si elle a déjà dépassé ce stade —
 * compléter un rapport après la facturation ne doit pas rouvrir le dossier.
 */
export async function reportIntervention(
  auth: TicketActor,
  ticketId: string,
  input: InterventionInput
): Promise<TicketResult<InterventionReport>> {
  const writable = await loadWritableTicket(auth, ticketId);

  if (!writable.ok) {
    return writable;
  }

  const normalized = normalizeInput(input);

  if (!normalized.ok) {
    return fail(normalized.error, 400);
  }

  if (!normalized.changed) {
    return fail("Aucune information à enregistrer.", 400);
  }

  const existing = await prisma.intervention.findUnique({
    where: { ticketId },
    select: { id: true },
  });

  if (existing) {
    return fail(
      "Cette intervention a déjà un rapport : modifiez-le au lieu d'en créer un second.",
      409
    );
  }

  const intervention = await prisma.intervention.create({
    data: { ticketId, ...normalized.data },
    select: REPORT_SELECT,
  });

  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: DIAGNOSABLE_STATUSES.includes(writable.data.status)
      ? { status: TicketStatus.DIAGNOSING }
      : {},
  });

  await announce(
    ticket.reference,
    ticket.id,
    writable.data.clientUserId,
    "diagnostic"
  );

  return { ok: true, data: toReport(intervention) };
}

/** Complète un rapport existant : le technicien revient affiner son constat. */
export async function updateIntervention(
  auth: TicketActor,
  ticketId: string,
  input: InterventionInput
): Promise<TicketResult<InterventionReport>> {
  const writable = await loadWritableTicket(auth, ticketId);

  if (!writable.ok) {
    return writable;
  }

  const normalized = normalizeInput(input);

  if (!normalized.ok) {
    return fail(normalized.error, 400);
  }

  if (!normalized.changed) {
    return fail("Aucune modification demandée.", 400);
  }

  const existing = await prisma.intervention.findUnique({
    where: { ticketId },
    select: { id: true },
  });

  if (!existing) {
    return fail(
      "Cette intervention n'a pas encore de rapport : créez-le d'abord.",
      404
    );
  }

  const intervention = await prisma.intervention.update({
    where: { ticketId },
    data: normalized.data,
    select: REPORT_SELECT,
  });

  return { ok: true, data: toReport(intervention) };
}

async function announce(
  reference: string,
  ticketId: string,
  clientUserId: string | null,
  stage: string
): Promise<void> {
  if (!clientUserId) {
    return;
  }

  await notify({
    userIds: [clientUserId],
    type: NotificationType.TICKET_STATUS_CHANGED,
    title: `${reference} : rapport d'intervention`,
    body: `Le technicien a déposé son ${stage} sur votre demande.`,
    ticketId,
  });
}