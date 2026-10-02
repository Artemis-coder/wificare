import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

import { canUseBackoffice, isStaff } from '@/lib/roles';
import { loadReadableTicket } from '@/lib/tickets';
import { listTechnicians } from '@/lib/technicians';
import AssignTechnicianForm from './assign-technician-form';
import QuotePanel from './quote-panel';
import TechnicianMap from './technician-map';

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

  // Le back-office est réservé à la régie : un compte technicien ou
  // propriétaire n'y a pas d'espace et son compte n'y est pas connecté
  // (`lib/auth.ts` refuse sa connexion). Cette garde couvre le cas d'une
  // session antérieure à cette règle, ou d'un rôle changé depuis la
  // connexion — sans elle, la page resterait le seul endroit qui ne borne pas
  // ce qu'elle affiche.
  if (!canUseBackoffice(session.user.role)) {
    redirect('/login');
  }

  const resolvedParams = await params;
  const ticketId = resolvedParams.id;

  // La page chargeait la demande par son identifiant, sans vérifier à qui elle
  // appartient : n'importe quel compte connecté pouvait en lire une autre en
  // changeant l'URL, et voir le nom du client, sa zone et le montant de son
  // devis. `lib/auth.ts` ferme désormais la porte aux rôles sans espace web, et
  // `loadReadableTicket` reste la seconde couche, celle qui décrit ce que la
  // page lit.
  const readable = await loadReadableTicket(
    { userId: session.user.id, role: session.user.role },
    ticketId
  );

  if (!readable.ok) {
    notFound();
  }

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
      // Les coordonnées sont lues ici, et non recalculées : la position est
      // celle que le technicien a partagée, avec la précision qu'il a obtenue
      // sur le terrain.
      latitude: true,
      longitude: true,
      accuracy: true,
      speed: true,
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
        latitude: trackingRow.latitude,
        longitude: trackingRow.longitude,
        accuracy: trackingRow.accuracy,
        speed: trackingRow.speed,
        // La destination n'est connue que si la zone a été géolocalisée. Une
        // zone sans coordonnées ne se déduit pas : la carte montre alors le
        // technicien seul, plutôt qu'un point de destination inventé.
        destination:
          ticket.wifiZone?.latitude != null && ticket.wifiZone?.longitude != null
            ? {
                latitude: ticket.wifiZone.latitude,
                longitude: ticket.wifiZone.longitude,
              }
            : null,
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

          {/* Section 3: Devis, decision et reglement */}
          {ticket.quoteInvoice && (
            <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)', padding: '24px', border: '1px solid var(--border-default)', boxShadow: 'var(--elevation-1)' }}>
              <QuotePanel
                quote={{
                  status: ticket.quoteInvoice.status,
                  totalAmount: ticket.quoteInvoice.totalAmount,
                  notes: ticket.quoteInvoice.notes,
                  sentAt: ticket.quoteInvoice.sentAt?.toISOString() ?? null,
                  acceptedAt: ticket.quoteInvoice.acceptedAt?.toISOString() ?? null,
                  rejectedAt: ticket.quoteInvoice.rejectedAt?.toISOString() ?? null,
                  lines: ticket.quoteInvoice.lines.map((line) => ({
                    id: line.id,
                    description: line.description,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    totalPrice: line.totalPrice,
                  })),
                  payment: ticket.quoteInvoice.payment
                    ? {
                        channel: ticket.quoteInvoice.payment.channel,
                        operator: ticket.quoteInvoice.payment.operator,
                        // La route de reglement n'ecrit que `transactionRef` ;
                        // `reference` reste vide pour un paiement Mobile Money,
                        // ou l'ancien decre ne le remplissait pas. Lire les deux
                        // evite d'afficher « Encaissement direct » a cote d'une
                        // reference que le client a pourtant saisie.
                        transactionRef:
                          ticket.quoteInvoice.payment.transactionRef ??
                          ticket.quoteInvoice.payment.reference,
                        createdAt: ticket.quoteInvoice.payment.createdAt.toISOString(),
                      }
                    : null,
                }}
              />
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

                  {/* La carte vient avant les chiffres : elle répond d'abord à la
                      question que se pose la régie — « où il est ? » — et les
                      mesures ci-dessous la précisent ensuite. */}
                  <TechnicianMap
                    technician={{ latitude: tracking.latitude, longitude: tracking.longitude }}
                    destination={tracking.destination}
                    technicianName={tracking.technicianName}
                  />

                  {/* Les coordonnées seules manquaient. La régie voit où se trouve
                      le technicien, mais ne peut ni le situer sur un plan, ni
                      distinguer une position fiable d'un point figé loin de la
                      panne. La carte et la précision ci-dessous couvrent les deux. */}
                  <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {tracking.latitude.toFixed(5)}, {tracking.longitude.toFixed(5)}
                    {tracking.accuracy !== null && (
                      <> · précision ±{Math.round(tracking.accuracy)} m</>
                    )}
                    {tracking.speed !== null && tracking.speed > 0 && (
                      <> · {Math.round(tracking.speed * 3.6)} km/h</>
                    )}
                  </div>

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
