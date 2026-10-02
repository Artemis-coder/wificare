'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/roles';
import { createZoneAsStaff } from '@/lib/zones';

/**
 * Déclaration d'une zone par la régie.
 *
 * Contrairement à la déclaration faite par un propriétaire, la zone entre
 * directement en exploitation : c'est la régie qui la saisit, elle n'a donc pas
 * à attendre sa propre validation.
 */
export async function createZoneAsStaffAction(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isSuperAdmin(session.user.role)) {
    throw new Error('Réservé au super administrateur.');
  }

  const result = await createZoneAsStaff(formData.get('clientId') as string, {
    name: formData.get('name'),
    location: formData.get('location'),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath('/zones');
  revalidatePath('/admin/zones');
  redirect('/zones');
}