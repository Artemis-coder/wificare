import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { isStaff } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * Avis clients, pour la régie.
 *
 * Réservée à l'administration et à la super administration : ces avis engagent
 * la relation entre le client et le technicien, ils n'ont pas à être publics.
 *
 * Chaque avis reste rattaché à son intervention. C'est le regroupement par
 * technicien qui intéresse la régie : la question n'est pas « que pense ce
 * client » mais « quel technicien est mal noté, et sur quelles interventions ».
 */
export default async function ReviewsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isStaff(session.user.role)) {
    redirect('/');
  }

  const reviews = await prisma.evaluation.findMany({
    include: {
      client: { select: { name: true, phone: true } },
      technician: { select: { name: true, phone: true } },
      ticket: { select: { reference: true, type: true, wifiZone: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const average =
    reviews.length === 0
      ? 0
      : reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

  // Moyenne par technicien : le classement qui sert à la régie, la moyenne
  // globale masquant les écarts entre les interventions d'un même technicien.
  const perTechnician = new Map<
    string,
    { name: string; total: number; count: number }
  >();

  for (const review of reviews) {
    if (!review.technician) continue;

    const key = review.technicianId ?? '—';
    const entry = perTechnician.get(key) ?? {
      name: review.technician.name ?? 'Technicien',
      total: 0,
      count: 0,
    };

    entry.total += review.rating;
    entry.count += 1;
    perTechnician.set(key, entry);
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1>Avis clients</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Notes laissées par les clients sur les interventions réalisées.
          </p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="data-table-wrapper" style={{ marginTop: '24px' }}>
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Aucun avis pour le moment.
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginTop: '24px',
            }}
          >
            <div className="stat-card">
              <div className="stat-label">Note moyenne</div>
              <div className="stat-value">{average.toFixed(1).replace('.', ',')} / 5</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avis collectés</div>
              <div className="stat-value">{reviews.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Techniciens évalués</div>
              <div className="stat-value">{perTechnician.size}</div>
            </div>
          </div>

          <h2 style={{ marginTop: '32px', marginBottom: '12px', fontSize: '18px' }}>
            Moyenne par technicien
          </h2>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Technicien</th>
                  <th>Téléphone</th>
                  <th>Note moyenne</th>
                  <th>Avis</th>
                </tr>
              </thead>
              <tbody>
                {[...perTechnician.entries()].map(([id, entry]) => {
                  const technicianAverage = entry.total / entry.count;

                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 600 }}>{entry.name}</td>
                      <td>{reviews.find((r) => r.technicianId === id)?.technician?.phone ?? '—'}</td>
                      <td>
                        <span
                          className={`badge ${technicianAverage >= 4 ? 'badge-success' : technicianAverage >= 3 ? 'badge-warning' : 'badge-error'}`}
                        >
                          {technicianAverage.toFixed(1).replace('.', ',')} / 5
                        </span>
                      </td>
                      <td>{entry.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: '32px', marginBottom: '12px', fontSize: '18px' }}>
            Avis détaillés
          </h2>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Intervention</th>
                  <th>Client</th>
                  <th>Technicien</th>
                  <th>Note</th>
                  <th>Commentaire</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{review.ticket.reference}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {review.ticket.wifiZone.name} · {review.ticket.type}
                      </div>
                    </td>
                    <td>
                      <div>{review.client.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {review.client.phone}
                      </div>
                    </td>
                    <td>{review.technician?.name ?? '—'}</td>
                    <td>
                      <span
                        className={`badge ${review.rating >= 4 ? 'badge-success' : review.rating >= 3 ? 'badge-warning' : 'badge-error'}`}
                      >
                        {review.rating} / 5
                      </span>
                    </td>
                    <td style={{ maxWidth: '280px' }}>
                      {review.comment ?? '—'}
                    </td>
                    <td>
                      {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}