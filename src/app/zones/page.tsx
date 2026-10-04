import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canUseBackoffice, isSuperAdmin } from '@/lib/roles';
import { listZonesFor } from '@/lib/zones';
import { KpiCard, KpiIcon } from '@/components/kpi-card';
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
  const activeCount = rows.filter((zone) => zone.status === 'ACTIVE').length;

  // Totaux du parc. La liste, en dessous, affiche déjà l'équipement et les
  // demandes de chaque zone ligne à ligne — la carte répond « combien », la
  // ligne répond « lesquelles ».
  const totalEquipments = rows.reduce((sum, zone) => sum + zone.equipmentCount, 0);
  const totalTickets = rows.reduce((sum, zone) => sum + zone.ticketCount, 0);
  // Une zone validée mais sans équipement ne peut pas servir : c'est un engagement
  // pris sur le parc que rien n'honore. Une zone en attente, elle, n'est pas
  // encore bâtie — la compter ici la ferait passer pour un défaut alors que sa
  // carte « À valider » la suit déjà.
  const withoutEquipment = rows.filter(
    (zone) => zone.status === 'ACTIVE' && zone.equipmentCount === 0
  ).length;

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

      {/* Lecture du parc, et file de travail. « 3 zones à valider » n'est pas
          qu'un chiffre : ce sont trois zones qui ne peuvent recevoir aucune
          demande tant qu'elles ne sont pas validées. Les trois cartes qui
          décrivent un sous-ensemble de la liste la filtrent donc ; les trois
          autres comptent des équipements et des demandes, qui ne sont pas des
          zones et ne peuvent pas la filtrer. */}
      <div className="dashboard-grid">
        <KpiCard
          label="Zones du parc"
          value={rows.length}
          note={canManage ? undefined : 'les vôtres'}
          tone="blue"
          icon={<KpiIcon path="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />}
          href="/zones"
          selected={initialStatus === 'ALL'}
        />
        <KpiCard
          label="Zones actives"
          value={activeCount}
          note="exploitables"
          tone="success"
          icon={<KpiIcon path="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />}
          href="/zones?status=ACTIVE"
          selected={initialStatus === 'ACTIVE'}
        />
        <KpiCard
          label="À valider"
          value={pendingCount}
          note={pendingCount > 0 ? 'bloquent toute demande' : 'rien en attente'}
          tone="warning"
          icon={<KpiIcon path="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />}
          href="/zones?status=PENDING"
          selected={initialStatus === 'PENDING'}
        />
        <KpiCard
          label="Équipements déployés"
          value={totalEquipments}
          note="antennes, routeurs, câblage"
          tone="blue"
          icon={<KpiIcon path="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />}
        />
        <KpiCard
          label="Demandes rattachées"
          value={totalTickets}
          note="toutes zones confondues"
          tone="purple"
          icon={<KpiIcon path="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />}
        />
        <KpiCard
          label="Zones sans équipement"
          value={withoutEquipment}
          note={withoutEquipment > 0 ? 'validées mais inertes' : 'tout est équipé'}
          tone={withoutEquipment > 0 ? 'warning' : 'success'}
          icon={<KpiIcon path="M12 9v4M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />}
        />
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

      {/* `key` : le filtre du sélecteur et celui des cartes sont le même état,
          mais il vit dans le composant client, qui ne se rejoue pas sur un
          changement d'URL. Sans la clé, cliquer « Zones actives » ne
          changerait que l'adresse — la liste resterait sur « Toutes ». La clé
          remonte le composant à chaque changement de filtre, ce qui réinitialise
          aussi la recherche : on change de vue, on ne le dit pas en même temps. */}
      <ZoneList
        key={initialStatus}
        zones={rows}
        canManage={canManage}
        initialStatus={initialStatus}
      />
    </div>
  );
}
