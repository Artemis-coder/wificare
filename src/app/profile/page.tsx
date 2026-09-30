import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  // Fetch complete user profile from Neon
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: (session.user as any)?.phone },
        { name: session.user?.name },
      ],
    },
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
        <div>
          <h1>Mon Profil & Compte</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Consultez les informations de votre compte et vos identifiants Wi-Fi Zone.
          </p>
        </div>
      </div>

      {/* Main Profile Card */}
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-2)', overflow: 'hidden', marginBottom: '24px' }}>
        {/* Banner Header */}
        <div style={{ height: '120px', background: 'linear-gradient(135deg, var(--brand-700) 0%, var(--accent-purple) 100%)', position: 'relative' }}></div>
        
        <div style={{ padding: '0 32px 32px 32px', position: 'relative', marginTop: '-40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px' }}>
              <div style={{ width: '88px', height: '88px', borderRadius: '50%', backgroundColor: 'var(--brand-600)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, border: '4px solid var(--bg-primary)', boxShadow: 'var(--elevation-2)' }}>
                {user?.name?.[0] || 'U'}
              </div>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>{user?.name || session.user?.name || 'Détenteur Wi-Fi'}</h2>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span className="badge badge-brand">
                    <span className="badge-dot"></span>
                    {user?.role || (session.user as any)?.role || 'ADMINISTRATEUR'}
                  </span>
                  <span>• Inscrit le {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR') : 'Récemment'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-default)' }}>
            <div>
              <div className="label" style={{ marginBottom: '6px' }}>Numéro de Téléphone (Identifiant)</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {user?.phone || (session.user as any)?.phone || 'Non renseigné'}
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: '6px' }}>Statut du Compte</div>
              <div>
                <span className="badge badge-success">
                  <span className="badge-dot"></span>
                  {user?.status || 'ACTIF'}
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

      {/* Mes Wi-Fi Zones Rattachées */}
      {user?.clients && user.clients.length > 0 && (
        <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-default)', padding: '24px', boxShadow: 'var(--elevation-1)' }}>
          <h3 style={{ marginBottom: '16px' }}>Emplacements & Wi-Fi Zones associées</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {user.clients.flatMap(c => c.wifiZones).map(zone => (
              <div key={zone.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', backgroundColor: 'var(--neutral-50)' }}>
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
