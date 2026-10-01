import { TicketStatus } from "@prisma/client";

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
  /** Demandes non clôturées affectées au technicien. */
  openTickets: number;
  /** Un technicien hors service ne peut pas recevoir de demande. */
  assignable: boolean;
};

/** Annuaire complet, en service d'abord puis par nom. */
export async function listTechnicians(): Promise<TechnicianSummary[]> {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN" },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      tickets: {
        where: { status: { notIn: CLOSED_STATUSES } },
        select: { id: true },
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return technicians.map((technician) => ({
    id: technician.id,
    name: technician.name,
    phone: technician.phone,
    status: technician.status,
    openTickets: technician.tickets.length,
    assignable: technician.status === "ACTIVE",
  }));
}