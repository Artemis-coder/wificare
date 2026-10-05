import { TaskOfferStatus, TicketStatus } from "@prisma/client";

import { prisma } from "./prisma";

/**
 * Annuaire des techniciens, pour la répartition des demandes.
 *
 * La liste précédente ne gardait que les comptes `ACTIVE`. Un technicien
 * désactivé disparaissait alors de l'écran sans laisser de trace : la régie ne
 * pouvait plus distinguer « ce technicien n'existe pas » de « ce technicien est
 * hors service », et une affectation refusée par le serveur semblait
 * inexplicable. L'annuaire liste donc **tous** les comptes de rôle
 * TECHNICIAN, en indiquant lesquels sont affectables.
 *
 * La charge courante est renvoyée avec : « qui est disponible » n'a pas de sens
 * sans savoir qui est déjà sur le terrain, et c'est la première question de la
 * répartition.
 *
 * La présence est jointe au même endroit, et pour la même raison : c'est elle
 * qui décide de qui reçoit une demande. Elle est renvoyée avec son heure de
 * dernière activité plutôt que comme un simple booléen, parce qu'un technicien
 * qui s'est déclaré en ligne mais dont le téléphone ne répond plus occupe la
 * répartition sans la servir — et que seule l'heure permet de le voir.
 */

/** Statuts qui clôturent une intervention : le technicien n'est plus sur le dos. */
const CLOSED_STATUSES: TicketStatus[] = [
  TicketStatus.COMPLETED,
  TicketStatus.CLOSED,
  TicketStatus.CANCELED,
];

export type TechnicianSummary = {
  id: string;
  name: string | null;
  phone: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  /** Le technicien s'est déclaré disponible pour une nouvelle demande. */
  isOnline: boolean;
  /** Depuis quand il a déclaré sa disponibilité. */
  onlineSince: Date | null;
  /** Dernière preuve de vie de son appareil. */
  lastSeenAt: Date | null;
  /** Demandes non clôturées affectées au technicien. */
  openTickets: number;
  /** Demandes qui lui sont proposées et auxquelles il n'a pas répondu. */
  pendingOffers: number;
  /** Un technicien hors service ne peut pas recevoir de demande. */
  assignable: boolean;
};

/** Annuaire complet, en service puis en ligne d'abord, enfin par nom. */
export async function listTechnicians(): Promise<TechnicianSummary[]> {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN" },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      isOnline: true,
      onlineSince: true,
      lastSeenAt: true,
      tickets: {
        where: { status: { notIn: CLOSED_STATUSES } },
        select: { id: true },
      },
      taskOffers: {
        where: { status: TaskOfferStatus.PENDING },
        select: { id: true },
      },
    },
    orderBy: [{ status: "asc" }, { isOnline: "desc" }, { name: "asc" }],
  });

  return technicians.map((technician) => ({
    id: technician.id,
    name: technician.name,
    phone: technician.phone,
    status: technician.status,
    isOnline: technician.isOnline,
    onlineSince: technician.onlineSince,
    lastSeenAt: technician.lastSeenAt,
    openTickets: technician.tickets.length,
    pendingOffers: technician.taskOffers.length,
    assignable: technician.status === "ACTIVE",
  }));
}