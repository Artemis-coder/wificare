'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { isStaff } from '@/lib/roles';
import { createTicket, assignTicket } from '@/lib/tickets';

/**
 * Création d'une demande depuis le back-office.
 *
 * La répartition est déléguée à `lib/tickets` : le formulaire web et
 * l'application mobile appliquent donc la même règle d'affectation.
 */
export async function createTicketAction(formData: FormData) {
  const wifiZoneId = formData.get('wifiZoneId') as string;
  const type = formData.get('type') as string;
  const priority = formData.get('priority') as string;
  const description = formData.get('description') as string;

  const result = await createTicket({
    wifiZoneId,
    type,
    priority,
    description,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath('/tickets');
  revalidatePath('/');
  redirect('/tickets');
}

/**
 * Affectation d'un technicien choisi dans le détail d'une demande.
 *
 * Le contrôle de rôle est refait côté serveur : masquer le sélecteur dans
 * l'interface ne protège pas la donnée, seule la règle ici-dessous le fait.
 */
export async function assignTicketAction(ticketId: string, technicianId: string) {
  // Le rôle est vérifié ici, et pas seulement en masquant le sélecteur :
  // l'interface ne protège pas la donnée, seule cette règle le fait.
  const session = await getServerSession(authOptions);

  if (!session || !isStaff(session.user.role)) {
    throw new Error(
      'Seul un super administrateur peut affecter un technicien.'
    );
  }

  const result = await assignTicket(ticketId, technicianId);

  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath('/tickets');
  revalidatePath('/');
}
