import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canUseBackoffice, isSuperAdmin } from '@/lib/roles';
import { listZonesFor } from '@/lib/zones';
import { ZoneList } from './zone-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wi-Fi Zones - WiFiCare',
};

type ZoneRow = {
  id: string;
  name: string;
  location: string;
  status: 'PENDING' | 'ACTIVE';
  createdAt: string;
  ownerName: string;
  ownerContact: string;
  equipmentCount: number;
  ticketCount: number;
};

/**
 * Parc Wi-Fi de la plateforme.
 *
 * Le super administrateur y trouve toutes les zones, tous propriétaires
 * confondus : il doit pouvoir retrouver une zone précise, la corriger, la
 * supprimer, ou intervenir dessus. Un propriétaire n'y voit que ses propres
 * zones, un technicien rien du tout — il travaille sur des demandes, pas sur un
 * annuaire de zones.
 */
export default async function ZonesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
        redirect('/login');
  }

  // Le back-office est réservé à la régie : un compte technicien ou
  // propriétaire n'y a pas d'espace et son compte n'y est pas connecté
  // (`lib/auth.ts` refuse sa connexion). Cette garde couvre le cas d'une
  // session antérieure à cette règle, ou d'un rôle changé depuis la
  // connexion — sans elle, la page resterait le seul endroit qui ne borne pas
  // ce qu'elle affiche.
  if (!canUseBackoffice(session.user.role)) {
    redirect('/login');
  }

  const canManage = isSuperAdmin(session.user.role);

  const zones = await listZonesFor({
    userId: session.user.id,
    role: session.user.role,
  });

  // Les compteurs disent à quoi sert réellement une zone avant de décider de
  // la supprimer : une zone qui porte des demandes ne peut pas l'être.
  const usage = await prisma.wifiZone.findMany({
    select: {
      id: true,
      _count: { select: { tickets: true, equipments: true } },
    },
  });

  const usageByZone = new Map(
    usage.map((zone) => [
      zone.id,
      { tickets: zone._count.tickets, equipments: zone._count.equipments },
    ])
  );

  const rows: ZoneRow[] = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    location: zone.location,
    status: zone.status,
    createdAt: zone.createdAt.toISOString(),
    ownerName: zone.client.name,
    ownerContact: zone.client.contact,
    equipmentCount: usageByZone.get(zone.id)?.equipments ?? 0,
    ticketCount: usageByZone.get(zone.id)?.tickets ?? 0,
  }));

  const pendingCount = rows.filter((zone) => zone.status === 'PENDING').length;

  // Le tableau de bord renvoie ici avec `?status=PENDING` quand il annonce des
  // zones à valider : le filtre doit être déjà positionné à l'arrivée, sinon le
  // renvoi ne mène qu'à la même liste et le compte annoncé n'est plus à l'écran.
  const { status } = await searchParams;
  const initialStatus: 'ALL' | ZoneRow['status'] =
    status === 'PENDING' || status === 'ACTIVE' ? status : 'ALL';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h1>Wi-Fi Zones</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            {canManage
              ? 'Toutes les zones de la plateforme et leurs propriétaires.'
              : 'Gérez vos zones et vos équipements Wi-Fi.'}
          </p>
        </div>
        {canManage && (
          <Link
            href="/admin/zones"
            className="btn btn-primary btn-lg"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter une zone
          </Link>
        )}
      </div>

      {canManage && pendingCount > 0 && (
        <div role="status" className="alert alert-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: '14px' }}>
            <strong>{pendingCount}</strong> zone(s) déclarée(s) attendent votre
            validation. Tant qu&apos;elles ne sont pas validées, aucune demande
            d&apos;intervention ne peut les concerner.
          </span>
        </div>
      )}

      <ZoneList zones={rows} canManage={canManage} initialStatus={initialStatus} />
    </div>
  );
}