'use server';

import { revalidatePath } from 'next/cache';

import { changeOwnPassword, getSuperAdminSession } from '@/lib/user-admin';
import { captureForUser } from '@/lib/posthog-server';

/**
 * Actions de la page Mon profil.
 *
 * Même séparation que sur les autres pages : l'interface web s'authentifie par
 * cookie de session NextAuth et non par jeton Bearer, elle passe donc par des
 * server actions, tandis que les règles restent dans `lib/user-admin`. Une règle
 * écrite dans un seul endroit ne peut pas être contournée par l'autre chemin.
 */

/** Réponse de l'action de changement de mot de passe. */
export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changeOwnPasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<ChangePasswordResult> {
  const auth = await getSuperAdminSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  // La confirmation est vérifiée ici, pas seulement dans le formulaire : celui-ci
  // est une aide à la saisie, il n'est pas une garantie. Une action serveur
  // appelée directement — un script, un appel_extension — n'y passe pas.
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'Les deux mots de passe ne correspondent pas.' };
  }

  const result = await changeOwnPassword(auth.userId, currentPassword, newPassword);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Un changement de mot de passe est un événement de sécurité, et le seul que
  // ce compte puisse déclencher sur lui-même. Tracé par son auteur, sans la
  // valeur : ni l'ancien ni le nouveau ne quittent le serveur.
  await captureForUser(auth.userId, 'password_changed');

  // Le changement est fait, mais la session en cours reste ouverte. Se
  // déconnecter ici est une décision d'interface, pas de règle métier : elle se
  // prend dans le formulaire, qui sait ce qu'il a réussi à faire.
  revalidatePath('/profile');

  return { ok: true };
}