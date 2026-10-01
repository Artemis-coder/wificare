import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

import { isSuperAdmin, ROLE_LABEL, type AppRole } from '@/lib/roles';
import { UserSearch } from './user-search';
import { NewUserDialog } from './new-user-dialog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Utilisateurs - WiFiCare',
};

const STATUS_LABEL = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
} as const;

const ROLE_BADGE: Record<AppRole, string> = {
  SUPER_ADMIN: 'badge-brand',
  ADMIN: 'badge-purple',
  TECHNICIAN: 'badge-warning',
  CLIENT: 'badge-neutral',
};

type Row = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  role: AppRole;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: Date;
  passwordHash: string | null;
  _count: { tickets: number; clients: number };
};

/**
 * Annuaire des comptes, réservé au super administrateur.
 *
 * La page lit la base directement : elle rend la liste, les filtres et les
 * actions par rôle. Toute modification passe par `PATCH /api/admin/users`, qui
 * refuse la requête si le jeton n'est pas celui d'un super administrateur —
 * l'interface ne suffit pas à protéger l'action.
 */
export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isSuperAdmin(session.user.role)) {
    redirect('/');
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      passwordHash: true,
      _count: { select: { tickets: true, clients: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  });

  const rows: Row[] = users;
  const counts = rows.reduce<Record<string, number>>((acc, user) => {
    acc[user.role] = (acc[user.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Utilisateurs</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Comptes de la plateforme, leurs rôles et leur statut d&apos;accès.
          </p>
        </div>
        <NewUserDialog />
      </div>

      <div className="dashboard-grid" style={{ marginTop: '0', marginBottom: '24px' }}>
        {(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN', 'CLIENT'] as const).map((role) => (
          <div key={role} className="kpi-card">
            <div className="label">{ROLE_LABEL[role]}</div>
            <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>
              {counts[role] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <UserSearch
        currentUserId={session.user.id}
        users={rows.map((user) => ({
          id: user.id,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          roleLabel: ROLE_LABEL[user.role],
          status: user.status,
          statusLabel: STATUS_LABEL[user.status],
          badge: ROLE_BADGE[user.role],
          createdAt: user.createdAt.toISOString(),
          hasPassword: user.passwordHash !== null,
          ticketCount: user._count.tickets,
          zoneOwnerCount: user._count.clients,
        }))}
      />
    </div>
  );
}
