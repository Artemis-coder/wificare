import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createTicket } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function NewTicketPage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  const wifiZones = await prisma.wifiZone.findMany({
    include: {
      client: true,
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '12px', fontSize: '14px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Retour aux tickets
        </Link>
        <h1>Créer un nouveau ticket</h1>
        <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
          Déclarez un incident ou une demande d'intervention sur une Wi-Fi Zone.
        </p>
      </div>

      <div style={{ backgroundColor: 'var(--bg-primary)', padding: '32px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-1)' }}>
        <form action={createTicket} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="wifiZoneId">Wi-Fi Zone concernée *</label>
            <select 
              id="wifiZoneId"
              name="wifiZoneId" 
              required
              style={{ height: '44px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', backgroundColor: 'var(--bg-primary)', outline: 'none' }}
            >
              <option value="">Sélectionnez une Wi-Fi Zone...</option>
              {wifiZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} ({zone.client.name} - {zone.location})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="type">Type d'incident / problème *</label>
            <select 
              id="type"
              name="type" 
              required
              style={{ height: '44px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', backgroundColor: 'var(--bg-primary)', outline: 'none' }}
            >
              <option value="Panne totale réseau">Panne totale réseau</option>
              <option value="Lenteur de connexion">Lenteur de connexion</option>
              <option value="Problème de portail captif">Problème de portail captif</option>
              <option value="Défaillance matériel (Routeur/Switch)">Défaillance matériel (Routeur/Switch)</option>
              <option value="Autre intervention">Autre intervention</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="priority">Niveau de priorité *</label>
            <select 
              id="priority"
              name="priority" 
              defaultValue="NORMAL"
              style={{ height: '44px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', backgroundColor: 'var(--bg-primary)', outline: 'none' }}
            >
              <option value="LOW">Faible</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Haute</option>
              <option value="URGENT">Urgente (Intervention sous 2h)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="description">Description détaillée du problème</label>
            <textarea 
              id="description"
              name="description" 
              rows={4}
              placeholder="Précisez les symptômes constatés, les voyants sur le matériel, etc."
              style={{ padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <Link href="/tickets" className="btn btn-secondary btn-lg">
              Annuler
            </Link>
            <button type="submit" className="btn btn-primary btn-lg">
              Créer le ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
