'use server';

import { revalidatePath } from 'next/cache';

import {
  createUser,
  getSuperAdminSession,
  updateUser,
  type AccountInput,
  type AccountPatch,
} from '@/lib/user-admin';
import { ROLE_LABEL } from '@/lib/roles';

/**
 * Actions de la page Utilisateurs.
 *
 * L'interface web s'authentifie par cookie de session NextAuth, pas par jeton
 * Bearer : elle passe donc par des server actions et non par l'API. Les règles
 * métier restent dans `lib/user-admin`, que les deux chemins partagent.
 */

/** Réponse commune aux deux actions, consommée par les composants clients. */
export type ActionResult = {
  ok: boolean;
  error?: string;
  user?: {
    id: string;
    role: string;
    roleLabel: string;
    status: string;
    hasPassword: boolean;
  };
};

export async function createUserAction(
  input: AccountInput
): Promise<ActionResult> {
  const auth = await getSuperAdminSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await createUser(input);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath('/admin/utilisateurs');

  return {
    ok: true,
    user: {
      id: result.data.id,
      role: result.data.role,
      roleLabel: ROLE_LABEL[result.data.role],
      status: result.data.status,
      hasPassword: result.data.hasPassword,
    },
  };
}

export async function updateUserAction(
  id: string,
  patch: AccountPatch
): Promise<ActionResult> {
  const auth = await getSuperAdminSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await updateUser(auth.userId, id, patch);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath('/admin/utilisateurs');

  return {
    ok: true,
    user: {
      id: result.data.id,
      role: result.data.role,
      roleLabel: ROLE_LABEL[result.data.role],
      status: result.data.status,
      hasPassword: result.data.hasPassword,
    },
  };
}
