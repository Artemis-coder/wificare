import { Priority, TicketStatus } from '@prisma/client';

/**
 * Classes CSS des badges de statut et de priorité.
 *
 * Isolées du tableau pour être réutilisées par la ligne cliquable, qui est un
 * composant client : un composant serveur ne peut pas être importé par un
 * composant client. Les mêmes statuts doivent porter la même couleur partout,
 * ces fonctions sont donc la référence unique.
 */

export const getStatusBadgeClass = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.NEW:
    case TicketStatus.TO_VERIFY:
      return 'badge-neutral';
    case TicketStatus.ASSIGNED:
    case TicketStatus.CONFIRMED:
    case TicketStatus.EN_ROUTE:
      return 'badge-brand';
    case TicketStatus.DIAGNOSING:
    case TicketStatus.PENDING_QUOTE:
    case TicketStatus.REPAIRING:
      return 'badge-warning';
    case TicketStatus.COMPLETED:
    case TicketStatus.CLOSED:
      return 'badge-success';
    case TicketStatus.CANCELED:
    case TicketStatus.PENDING_PAYMENT:
      return 'badge-error';
    default:
      return 'badge-neutral';
  }
};

export const getPriorityBadgeClass = (priority: Priority): string => {
  switch (priority) {
    case Priority.LOW:
      return 'badge-neutral';
    case Priority.NORMAL:
      return 'badge-brand';
    case Priority.HIGH:
      return 'badge-warning';
    case Priority.URGENT:
      return 'badge-error';
    default:
      return 'badge-neutral';
  }
};