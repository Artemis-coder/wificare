import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createTicketAction } from '../actions';
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
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Retour aux demandes
        </Link>
        <h1>Nouvelle Demande ou Intervention</h1>
        <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
          Faites une demande d&apos;installation de matériel (antenne, routeur) ou signalez une panne.
        </p>
      </div>

      <div style={{ backgroundColor: 'var(--bg-primary)', padding: '36px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-2)' }}>
        <form action={createTicketAction} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="wifiZoneId">Wi-Fi Zone concernée *</label>
            <select 
              id="wifiZoneId"
              name="wifiZoneId" 
              required
              style={{ height: '48px', padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', backgroundColor: 'var(--bg-primary)', outline: 'none' }}
            >
              <option value="">Sélectionnez la Wi-Fi Zone ou l&apos;emplacement...</option>
              {wifiZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} — {zone.client.name} ({zone.location})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="type">Nature de la demande *</label>
            <select 
              id="type"
              name="type" 
              required
              style={{ height: '48px', padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', backgroundColor: 'var(--bg-primary)', outline: 'none' }}
            >
              <optgroup label="📡 Installations & Équipements">
                <option value="Installation Antenne">Installation d&apos;antenne (Point-à-point / Relais)</option>
                <option value="Nouveau Routeur">Ajout / Remplacement d&apos;un routeur Wi-Fi</option>
                <option value="Extension Couverture">Extension de zone / Répéteur supplémentaire</option>
              </optgroup>
              <optgroup label="🛠️ Pannes & Dépannage">
                <option value="Panne totale réseau">Panne totale (Signal indisponible)</option>
                <option value="Lenteur de connexion">Lenteur / Débit réduit</option>
                <option value="Problème de portail captif">Dysfonctionnement Portail Captif / Tickets</option>
                <option value="Défaillance matériel">Défaillance matériel (Câble, Switch, Alimentation)</option>
              </optgroup>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="priority">Priorité souhaitée *</label>
            <select 
              id="priority"
              name="priority" 
              defaultValue="NORMAL"
              style={{ height: '48px', padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', backgroundColor: 'var(--bg-primary)', outline: 'none' }}
            >
              <option value="LOW">Planifiée / Normale (sous 48h)</option>
              <option value="NORMAL">Haute (sous 24h)</option>
              <option value="HIGH">Très Haute (sous 12h)</option>
              <option value="URGENT">🚨 Urgente (Intervention immédiate sous 2h)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="description">Précisions & Détails de la demande</label>
            <textarea 
              id="description"
              name="description" 
              rows={4}
              placeholder="Ex: Besoin d'une nouvelle antenne de 5GHz pour couvrir le secteur Nord, ou préciser les symptômes de la panne..."
              style={{ padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '15px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Link href="/tickets" className="btn btn-secondary btn-lg">
              Annuler
            </Link>
            <button type="submit" className="btn btn-primary btn-lg">
              Envoyer la demande
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
