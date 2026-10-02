import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/roles';
import { createZoneAsStaffAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ajouter une zone - WiFiCare',
};

/**
 * Déclaration d'une zone par le super administrateur.
 *
 * La zone est rattachée à un dossier client existant : une Wi-Fi Zone est
 * toujours la propriété de quelqu'un, et c'est ce dossier qui porte les demandes
 * et la facturation. La régie ne crée donc pas de client ici.
 */
export default async function NewZonePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isSuperAdmin(session.user.role)) {
    redirect('/');
  }

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, contact: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link
          href="/zones"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            marginBottom: '12px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Retour aux zones
        </Link>
        <h1>Ajouter une Wi-Fi Zone</h1>
        <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
          Une zone saisie par la régie entre directement dans le parc
          exploitable : elle n&apos;a pas à être validée.
        </p>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          padding: '36px',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--elevation-2)',
        }}
      >
        {clients.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Aucun dossier client n&apos;existe. Une zone doit appartenir à un
            propriétaire : créez d&apos;abord le compte de ce propriétaire.
          </p>
        ) : (
          <form
            action={createZoneAsStaffAction}
            style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label className="label" htmlFor="clientId">
                Propriétaire *
              </label>
              <select
                id="clientId"
                name="clientId"
                required
                style={{
                  height: '48px',
                  padding: '0 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '15px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              >
                <option value="">Sélectionnez le propriétaire...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.contact})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label className="label" htmlFor="name">
                Nom de la zone *
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="Ex: WiFi Zone Angré 8e Tranche"
                style={{
                  height: '48px',
                  padding: '0 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '15px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label className="label" htmlFor="location">
                Emplacement
              </label>
              <input
                id="location"
                name="location"
                placeholder="Ex: Abidjan, Cocody Angré"
                style={{
                  height: '48px',
                  padding: '0 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '15px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Link href="/zones" className="btn btn-secondary btn-lg">
                Annuler
              </Link>
              <button type="submit" className="btn btn-primary btn-lg">
                Créer la zone
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}