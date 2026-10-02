'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { isStaff } from '@/lib/roles';
import { decideQuote, payQuote, type QuoteDecision } from '@/lib/quotes';
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

/**
 * Décision du client sur un devis, depuis le back-office.
 *
 * Le client qui décide dans l'application et celui qui décide dans le
 * navigateur appellent la même fonction : `decideQuote` applique les mêmes
 * refus, et déplace la demande de la même façon. Le rôle est vérifié ici, et
 * pas seulement en masquant les boutons — l'interface ne protège pas la
 * donnée, seule la règle le fait.
 */
export async function decideQuoteAction(
  invoiceId: string,
  ticketId: string,
  decision: QuoteDecision
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new Error('Session expirée. Reconnectez-vous.');
  }

  const result = await decideQuote(
    { userId: session.user.id, role: session.user.role },
    invoiceId,
    decision
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath('/tickets');
  revalidatePath('/invoices');
  revalidatePath('/');
}

/**
 * Règlement d'un devis, depuis le back-office.
 *
 * Même fonction que celle qu'appelle l'application mobile, pour la même
 * raison : un montant payé depuis un navigateur ne doit pas être un montant
 * traité autrement qu'un montant payé depuis un téléphone.
 */
export async function payQuoteAction(ticketId: string, formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new Error('Session expirée. Reconnectez-vous.');
  }

  const result = await payQuote(
    { userId: session.user.id, role: session.user.role },
    ticketId,
    {
      channel: formData.get('channel') as string,
      operator: (formData.get('operator') as string) || undefined,
      transactionRef: (formData.get('transactionRef') as string) || null,
    }
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath('/invoices');
  revalidatePath('/');
}
