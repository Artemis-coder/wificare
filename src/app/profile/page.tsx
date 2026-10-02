import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ROLE_LABEL } from '@/lib/roles';
import { SignOutButton } from './sign-out-button';
import { canUseBackoffice } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
} as const;

export default async function ProfilePage() {
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

  // La session porte l'identifiant du compte : la requête porte sur cet id, et
  // non sur le nom, qui n'est pas unique.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      clients: {
        include: {
          wifiZones: true,
        },
      },
    },
  });

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="page-header-text">
          <h1>Mon Profil &amp; Compte</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Consultez les informations de votre compte et vos identifiants Wi-Fi Zone.
          </p>
        </div>
      </div>

      {/* Main Profile Card */}
      <div className="panel panel-lg" style={{ overflow: 'hidden', marginBottom: '24px', padding: 0 }}>
        {/* Banner Header */}
        <div style={{ height: '120px', background: 'linear-gradient(135deg, var(--brand-700) 0%, var(--accent-purple) 100%)', position: 'relative' }}></div>
        
        <div className="profile-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '20px' }}>
              <div style={{ width: '88px', height: '88px', borderRadius: '50%', backgroundColor: 'var(--brand-600)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, border: '4px solid var(--bg-primary)', boxShadow: 'var(--elevation-2)' }}>
                {user?.name?.[0] || 'U'}
              </div>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>{user?.name || session.user?.name || 'Détenteur Wi-Fi'}</h2>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span className="badge badge-brand">
                    <span className="badge-dot"></span>
                    {user ? ROLE_LABEL[user.role] : ROLE_LABEL[session.user.role]}
                  </span>
                  <span>• Inscrit le {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR') : 'Récemment'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="two-col-grid" style={{ gap: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-default)' }}>
            <div>
              <div className="label" style={{ marginBottom: '6px' }}>Numéro de Téléphone (Identifiant)</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {user?.phone || session.user.phone || 'Non renseigné'}
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: '6px' }}>Statut du Compte</div>
              <div>
                <span className={`badge ${user?.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                  <span className="badge-dot"></span>
                  {STATUS_LABEL[user?.status ?? 'ACTIVE']}
                </span>
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: '6px' }}>ID Client / Référence</div>
              <div style={{ fontSize: '14px', fontFamily: 'monospace', color: 'var(--brand-700)', fontWeight: 600 }}>
                {user?.id || 'USR-2026-001'}
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: '6px' }}>Nombre de Wi-Fi Zones rattachées</div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>
                {user?.clients?.reduce((acc, c) => acc + c.wifiZones.length, 0) || 0} Zone(s)
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SignOutButton />
      </div>

      {/* Mes Wi-Fi Zones Rattachées */}
      {user?.clients && user.clients.length > 0 && (
        <div className="panel">
          <h3 style={{ marginBottom: '16px' }}>Emplacements &amp; Wi-Fi Zones associées</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {user.clients.flatMap(c => c.wifiZones).map(zone => (
              <div key={zone.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', backgroundColor: 'var(--neutral-50)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{zone.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>📍 {zone.location}</div>
                </div>
                <Link href="/zones" className="btn btn-secondary btn-md">
                  Voir la zone
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
