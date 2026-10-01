import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

import { isStaff } from '@/lib/roles';
import { listTechnicians } from '@/lib/technicians';
import AssignTechnicianForm from './assign-technician-form';

export const dynamic = 'force-dynamic';

const DISTANCE_NUMBER_FORMAT = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

// La distance est stockée en mètres, mais lue en kilomètres dès que ça vaut le coup :
// « à 850 m » se lit mieux que « à 0,8 km ».
function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `à ${meters.toLocaleString('fr-FR')} m`;
  }

  return `à ${(meters / 1000).toLocaleString('fr-FR', DISTANCE_NUMBER_FORMAT)} km`;
}

// « position il y a 3 min » : la dernière position connue peut dater de la demande
// initiale, il faut donc dire depuis quand elle est périmée.
function formatLastPosition(recordedAt: Date): string {
  const elapsedMinutes = Math.floor((Date.now() - recordedAt.getTime()) / 60000);

  if (elapsedMinutes < 1) {
    return 'position enregistrée à l’instant';
  }

  if (elapsedMinutes < 60) {
    return `position il y a ${elapsedMinutes} min`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `position il y a ${elapsedHours} h`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `position il y a ${elapsedDays} jour${elapsedDays > 1 ? 's' : ''}`;
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  const resolvedParams = await params;
  const ticketId = resolvedParams.id;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      client: true,
      wifiZone: true,
      technician: true,
      intervention: true,
      quoteInvoice: {
        include: {
          lines: true,
          payment: true,
        },
      },
    },
  });

  if (!ticket) {
    notFound();
  }

  // La liste des techniciens disponibles n'est chargée que pour la régie :
  // un client ou un technicien n'a rien à en faire, et n'a pas à la voir.
  const canAssign = isStaff(session.user.role);

  // Tout l'annuaire des techniciens, pas seulement ceux en service : un compte
  // hors service reste visible, grisé, pour que la régie sache qu'il existe.
  const technicians = canAssign ? await listTechnicians() : [];

  // Le suivi est lu à part : la ligne n'existe qu'à partir du premier point
  // envoyé par le technicien. Sans elle, on n'affiche rien du tout — pas de
  // bloc vide, pas de « non disponible » quand personne ne partage sa position.
  const trackingRow = await prisma.technicianTracking.findUnique({
    where: { ticketId: ticket.id },
    select: {
      technician: { select: { name: true } },
      distanceMeters: true,
      etaMinutes: true,
      recordedAt: true,
      stoppedAt: true,
    },
  });

  const tracking = trackingRow
    ? {
        active: trackingRow.stoppedAt === null,
        etaMinutes: trackingRow.etaMinutes,
        distanceMeters: trackingRow.distanceMeters,
        recordedAt: trackingRow.recordedAt,
        technicianName: trackingRow.technician.name ?? ticket.technician?.name ?? null,
      }
    : null;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Retour à la liste des tickets
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <h1>{ticket.reference}</h1>
              <span className="badge badge-brand">{ticket.status}</span>
            </div>
            <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
              Demande créée le {new Date(ticket.createdAt).toLocaleDateString('fr-FR')} à {new Date(ticket.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button className="btn btn-secondary btn-md">
            Imprimer le dossier
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Main Content Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Section 1: Nature de la Demande */}
          <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', padding: '24px', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-1)' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Nature &amp; Description de l&apos;Incident</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div className="label">Type d&apos;intervention</div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--brand-700)', marginTop: '2px' }}>
                  {ticket.type}
                </div>
              </div>
              <div>
                <div className="label">Description détaillée</div>
                <div style={{ marginTop: '4px', color: 'var(--text-primary)', backgroundColor: 'var(--neutral-50)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  {ticket.description || "Aucune précision complémentaire fournie lors de la création."}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Intervention & Diagnostic Technicien */}
          <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', padding: '24px', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-1)' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Rapport du Technicien</h3>
            {ticket.intervention ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div className="label">Diagnostic effectué</div>
                  <div style={{ fontWeight: 500 }}>{ticket.intervention.diagnostic || 'Diagnostic en cours'}</div>
                </div>
                <div>
                  <div className="label">Solution appliquée</div>
                  <div style={{ fontWeight: 500 }}>{ticket.intervention.solution || 'En attente de résolution'}</div>
                </div>
                {ticket.intervention.durationMin && (
                  <div>
                    <div className="label">Durée d&apos;intervention</div>
                    <div style={{ fontWeight: 500 }}>{ticket.intervention.durationMin} minutes</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic', padding: '12px 0' }}>
                Le technicien n&apos;a pas encore saisi de rapport pour cette intervention.
              </div>
            )}
          </div>

          {/* Section 3: Facturation & Reçu */}
          {ticket.quoteInvoice && (
            <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', padding: '24px', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', margin: 0 }}>Facturation Associée</h3>
                <span className={`badge ${ticket.quoteInvoice.status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>
                  {ticket.quoteInvoice.status === 'PAID' ? 'PAYÉ' : 'EN ATTENTE DE PAIEMENT'}
                </span>
              </div>

              <table className="data-table" style={{ marginBottom: '16px' }}>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th>Qté</th>
                    <th>Prix unitaire</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ticket.quoteInvoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td>{line.unitPrice.toLocaleString('fr-FR')} FCFA</td>
                      <td style={{ fontWeight: 600 }}>{line.totalPrice.toLocaleString('fr-FR')} FCFA</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Montant Total TTC</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand-700)' }}>
                  {ticket.quoteInvoice.totalAmount.toLocaleString('fr-FR')} FCFA
                </div>
              </div>

              {ticket.quoteInvoice.payment && (
                <div style={{ marginTop: '16px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--success-50)', border: '1px solid var(--success-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--success-600)', fontSize: '13px' }}>PAIEMENT REÇU PAR LE TECHNICIEN</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Moyen : {ticket.quoteInvoice.payment.channel} • Réf : {ticket.quoteInvoice.payment.reference || 'Encaissement direct'}
                    </div>
                  </div>
                  <span className="badge badge-success">Confirmé</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Information */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Wi-Fi Zone & Client Info */}
          <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', padding: '20px', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-1)' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '15px' }}>Emplacement</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div className="label">Wi-Fi Zone</div>
                <div style={{ fontWeight: 700 }}>{ticket.wifiZone.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>📍 {ticket.wifiZone.location}</div>
              </div>

              {tracking && (
                <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-default)' }}>
                  <div className="label">Suivi du technicien</div>

                  {tracking.technicianName && (
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>{tracking.technicianName}</div>
                  )}

                  {tracking.active ? (
                    tracking.etaMinutes !== null ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--brand-700)' }}>
                          {tracking.etaMinutes <= 1
                            ? 'Moins d’une minute'
                            : `Arrivée estimée dans ${tracking.etaMinutes} min`}
                        </div>
                        {tracking.distanceMeters !== null && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {formatDistance(tracking.distanceMeters)}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {formatLastPosition(tracking.recordedAt)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Le technicien partage sa position, mais la zone n’a pas encore de
                        coordonnées relevées par le client : impossible d’estimer son arrivée.
                      </div>
                    )
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Le technicien a arrêté de partager sa position.
                    </div>
                  )}
                </div>
              )}

              <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-default)' }}>
                <div className="label">Client / Propriétaire</div>
                <div style={{ fontWeight: 600 }}>{ticket.client.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>📞 {ticket.client.contact}</div>
              </div>
            </div>
          </div>

          {/* Technicien affecté */}
          <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', padding: '20px', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-1)' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '15px' }}>Technicien Assigné</h3>
            {ticket.technician ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--brand-100)', color: 'var(--brand-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                  {ticket.technician.name?.[0] || 'T'}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{ticket.technician.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>📞 {ticket.technician.phone}</div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-disabled)', fontSize: '13px' }}>
                Aucun technicien affecté pour le moment.
              </div>
            )}

            {canAssign && (
              <AssignTechnicianForm
                ticketId={ticket.id}
                technicians={technicians}
                currentTechnicianId={ticket.technicianId}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
