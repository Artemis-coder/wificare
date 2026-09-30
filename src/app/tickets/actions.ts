'use server';

import { prisma } from '@/lib/prisma';
import { Priority, TicketStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createTicket(formData: FormData) {
  const wifiZoneId = formData.get('wifiZoneId') as string;
  const type = formData.get('type') as string;
  const priority = formData.get('priority') as Priority;
  const description = formData.get('description') as string;

  if (!wifiZoneId || !type) {
    throw new Error('La zone Wi-Fi et le type d\'intervention sont requis.');
  }

  // Find zone to get associated client
  const zone = await prisma.wifiZone.findUnique({
    where: { id: wifiZoneId },
  });

  if (!zone) {
    throw new Error('Wi-Fi Zone introuvable.');
  }

  // Count tickets to generate ref
  const count = await prisma.ticket.count();
  const reference = `#TK-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

  await prisma.ticket.create({
    data: {
      reference,
      type,
      priority: priority || Priority.NORMAL,
      status: TicketStatus.NEW,
      description,
      clientId: zone.clientId,
      wifiZoneId: zone.id,
    },
  });

  revalidatePath('/tickets');
  revalidatePath('/');
  redirect('/tickets');
}
