import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role, UserStatus } from "@prisma/client";

import { authOptions } from "./auth";
import { getApiUser } from "./api-auth";
import { dispatchPendingTickets } from "./dispatch";
import { prisma } from "./prisma";
import { isSuperAdmin, type AppRole } from "./roles";
import {
  hashPassword,
  isValidPassword,
  verifyPassword,
  PASSWORD_LENGTH,
} from "./password";
import { normalizePhone } from "./phone";

/**
 * Gestion des comptes par le super administrateur.
 *
 * Les règles vivent ici, et non dans les appelants : l'interface web passe par
 * des server actions (session NextAuth), l'API mobile par un jeton Bearer. Les
 * deux chemins doivent appliquer exactement les mêmes refus, sinon l'un des deux
 * devient un angle mort.
 */

/** Résultat d'une opération : succès avec la donnée, ou refus motivé. */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/** Refuse l'appel si la requête ne vient pas d'un super administrateur. */
export function denyUnlessSuperAdminApi(
  request: NextRequest
): NextResponse | null {
  const auth = getApiUser(request);

  if (!auth) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (!isSuperAdmin(auth.role)) {
    return NextResponse.json(
      { error: "Réservé au super administrateur" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Session web du super administrateur.
 *
 * Renvoie l'identifiant à l'origine de la demande, ou le motif du refus : les
 * appelants ont besoin des deux, et faire lire la session deux fois les ferait
 * diverger entre l'autorisation et l'action.
 */
export async function getSuperAdminSession(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { ok: false, error: "Non authentifié." };
  }

  if (!isSuperAdmin(session.user.role)) {
    return { ok: false, error: "Réservé au super administrateur." };
  }

  return { ok: true, userId: session.user.id };
}

export type AccountInput = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  role?: unknown;
  password?: unknown;
};

/** Compte tel que renvoyé à l'appelant : jamais d'empreinte de mot de passe. */
export type PublicUser = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  role: AppRole;
  status: UserStatus;
  createdAt: Date;
  hasPassword: boolean;
};

function toPublicUser(user: {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  passwordHash: string | null;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    hasPassword: user.passwordHash !== null,
  };
}

const USER_SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  passwordHash: true,
} as const;

const fail = <T>(error: string, status: number): AdminResult<T> => ({
  ok: false,
  error,
  status,
});

/**
 * Crée un compte.
 *
 * L'inscription publique n'accepte que technicien et propriétaire de zone : un
 * compte d'administration ne peut pas s'attribuer ses propres droits. Cette
 * fonction comble ce manque pour la régie.
 */
export async function createUser(
  input: AccountInput
): Promise<AdminResult<PublicUser>> {
  const firstName =
    typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName =
    typeof input.lastName === "string" ? input.lastName.trim() : "";
  const phone = typeof input.phone === "string" ? normalizePhone(input.phone) : "";

  if (!firstName || !lastName) {
    return fail("Le nom et le prénom sont requis.", 400);
  }

  if (phone.length < 8) {
    return fail("Numéro de téléphone invalide.", 400);
  }

  if (!Object.values(Role).includes(input.role as Role)) {
    return fail("Rôle inconnu.", 400);
  }

  if (!isValidPassword(input.password)) {
    return fail(`Le mot de passe doit comporter ${PASSWORD_LENGTH} chiffres.`, 400);
  }

  const existing = await prisma.user.findFirst({
    where: { phone: { in: [phone] } },
    select: { id: true },
  });

  if (existing) {
    return fail("Ce numéro de téléphone est déjà utilisé.", 409);
  }

  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      phone,
      passwordHash: hashPassword(input.password as string),
      role: input.role as Role,
    },
    select: USER_SELECT,
  });

  return { ok: true, data: toPublicUser(user) };
}

export type AccountPatch = {
  role?: unknown;
  status?: unknown;
  password?: unknown;
};

/**
 * Modifie un compte : rôle, statut, mot de passe.
 *
 * `actorId` est le super administrateur à l'origine de la demande. Il ne peut
 * ni se modifier lui-même, ni rétrograder le dernier super administrateur actif
 * : dans les deux cas, la plateforme se retrouverait sans moyen de gérer ses
 * comptes.
 */
export async function updateUser(
  actorId: string,
  targetId: string,
  patch: AccountPatch
): Promise<AdminResult<PublicUser>> {
  if (actorId === targetId) {
    return fail("Vous ne pouvez pas modifier votre propre compte.", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true },
  });

  if (!target) {
    return fail("Compte introuvable.", 404);
  }

  const data: {
    role?: Role;
    status?: UserStatus;
    passwordHash?: string;
  } = {};

  if (patch.role !== undefined) {
    if (!Object.values(Role).includes(patch.role as Role)) {
      return fail("Rôle inconnu.", 400);
    }

    if (
      target.role === "SUPER_ADMIN" &&
      patch.role !== "SUPER_ADMIN" &&
      !(await hasOtherActiveSuperAdmin(targetId))
    ) {
      return fail(
        "Impossible : ce compte est le dernier super administrateur actif.",
        400
      );
    }

    data.role = patch.role as Role;
  }

  if (patch.status !== undefined) {
    if (!Object.values(UserStatus).includes(patch.status as UserStatus)) {
      return fail("Statut inconnu.", 400);
    }

    if (target.role === "SUPER_ADMIN" && patch.status !== "ACTIVE") {
      if (!(await hasOtherActiveSuperAdmin(targetId))) {
        return fail(
          "Impossible : ce compte est le dernier super administrateur actif.",
          400
        );
      }
    }

    data.status = patch.status as UserStatus;
  }

  if (patch.password !== undefined) {
    if (!isValidPassword(patch.password)) {
      return fail(`Le mot de passe doit comporter ${PASSWORD_LENGTH} chiffres.`, 400);
    }
    data.passwordHash = hashPassword(patch.password as string);
  }

  if (Object.keys(data).length === 0) {
    return fail("Aucune modification demandée.", 400);
  }

  // Un compte mis hors service ne peut pas rester déclaré disponible : il
  // continuerait de recevoir des demandes qu'il ne peut pas faire, et le
  // back-office afficherait un technicien en ligne sur un compte désactivé. La
  // disponibilité est retirée au même moment que le statut, et ses propositions
  // en attente sont closes pour que la demande reparte immédiatement.
  const leavingService = data.status !== undefined && data.status !== "ACTIVE";

  const user = await prisma.$transaction(async (tx) => {
    if (leavingService) {
      await tx.taskOffer.updateMany({
        where: { technicianId: targetId, status: "PENDING" },
        data: { status: "WITHDRAWN", respondedAt: new Date() },
      });
    }

    return tx.user.update({
      where: { id: targetId },
      data: {
        ...data,
        ...(leavingService ? { isOnline: false, onlineSince: null } : {}),
      },
      select: USER_SELECT,
    });
  });

  if (leavingService) {
    await dispatchPendingTickets();
  }

  return { ok: true, data: toPublicUser(user) };
}

/** Vrai s'il existe un autre super administrateur actif que celui donné. */
async function hasOtherActiveSuperAdmin(excludeId: string): Promise<boolean> {
  const count = await prisma.user.count({
    where: { role: "SUPER_ADMIN", status: "ACTIVE", id: { not: excludeId } },
  });

  return count > 0;
}

/**
 * Change le mot de passe du compte connecté.
 *
 * `updateUser` refuse toute auto-modification, et pour de bonnes raisons : la
 * garde qui protège le dernier administrateur d'une rétrogradation ne doit pas
 * pouvoir être contournée par le compte concerné. Un mot de passe n'a pas ce
 * risque — changer le sien est au contraire ce qu'un profil doit permettre — donc
 * cette fonction ne contourne pas `updateUser`, elle s'y ajoute.
 *
 * Le mot de passe actuel est exigé. Une session laissée ouverte sur un poste de
 * régie permettrait sinon de fixer un mot de passe que le titulaire ne connaît pas,
 * et de lui fermer la plateforme sans qu'il puisse s'en sortir : il ne lui
 * resterait qu'un autre administrateur pour le débloquer.
 *
 * Les deux erreurs — mot de passe actuel faux, nouveau mot de passe refusé —
 * sont volontairement distinctes : l'une se corrige d'un coup d'œil, l'autre
 * demande de relire la consigne. Les fusionner obligerait à afficher « mot de
 * passe incorrect » pour une saisie trop courte, ce qui ferait perdre celui qui
 * ne voit pas où il s'est trompé.
 */
export async function changeOwnPassword(
  actorId: string,
  currentPassword: unknown,
  nextPassword: unknown,
): Promise<AdminResult<null>> {
  if (typeof currentPassword !== "string" || !currentPassword) {
    return fail("Saisissez votre mot de passe actuel.", 400);
  }

  if (!isValidPassword(nextPassword)) {
    return fail(
      `Le nouveau mot de passe doit comporter ${PASSWORD_LENGTH} chiffres.`,
      400,
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, passwordHash: true },
  });

  if (!account) {
    return fail("Compte introuvable.", 404);
  }

  // Un compte créé par OTP n'a pas d'empreinte : il n'y a rien à vérifier, et
  // lui en créer une à partir d'un mot de passe que personne ne possède
  // reviendrait à lui laisser un accès qu'il n'a pas demandé.
  if (!account.passwordHash) {
    return fail("Ce compte n'a pas de mot de passe : connectez-vous par code.", 409);
  }

  if (!verifyPassword(currentPassword, account.passwordHash)) {
    return fail("Mot de passe actuel incorrect.", 400);
  }

  // Réécrire le même mot de passe ressemblerait à un changement réussi alors
  // que rien n'a bougé, et sur un poste partagé laisserait croire que le mot de
  // passe a été renouvelé.
  if (verifyPassword(nextPassword, account.passwordHash)) {
    return fail("Le nouveau mot de passe doit différer de l'actuel.", 400);
  }

  await prisma.user.update({
    where: { id: actorId },
    data: { passwordHash: hashPassword(nextPassword) },
  });

  return { ok: true, data: null };
}
