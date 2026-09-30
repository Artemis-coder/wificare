import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ZonesPage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  const zones = await prisma.wifiZone.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      client: true,
      equipments: true,
      _count: {
        select: { tickets: true }
      }
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Wi-Fi Zones</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Gérez votre parc de routeurs et d'équipements Wi-Fi.
          </p>
        </div>
        <button className="btn btn-primary btn-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Ajouter une zone
        </button>
      </div>

      <div className="dashboard-grid" style={{ marginTop: '24px' }}>
        {zones.map((zone) => (
          <div key={zone.id} className="kpi-card" style={{ cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>{zone.name}</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {zone.location}
                </div>
              </div>
              <span className="badge badge-success">Actif</span>
            </div>
            
            <div style={{ padding: '12px 0', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Propriétaire</div>
              <div style={{ fontWeight: 500, fontSize: '14px' }}>{zone.client.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{zone.client.contact}</div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                {zone.equipments.length} équipement(s)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                {zone._count.tickets} ticket(s)
              </div>
            </div>
          </div>
        ))}

        {zones.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-strong)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.5 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Aucune Wi-Fi Zone</h3>
            <p style={{ margin: 0 }}>Commencez par ajouter votre première zone pour pouvoir y associer des tickets.</p>
          </div>
        )}
      </div>
    </div>
  );
}
