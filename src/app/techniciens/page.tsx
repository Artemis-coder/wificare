import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Priority, type UserStatus } from '@prisma/client';

import { authOptions } from '@/lib/auth';
import { listDispatchQueue } from '@/lib/dispatch';

import { isSuperAdmin } from '@/lib/roles';
import { listTechnicians } from '@/lib/technicians';

/**
 * Techniciens en ligne et demandes en circulation.
 *
 * Deux questions, une seule page, parce qu'elles sont la même : qui peut prendre
 * une demande, et qu'y a-t-il qui n'a pas encore été pris. Répondre à la
 * première en ignorant la seconde Donnerait une équipe disponible face à une
 * liste vide, sans rien dire de l'attente.
 *
 * La page est en lecture seule. Elle dit ce que le système fait ; agir sur la
 * répartition — affecter une demande à quelqu'un — reste la décision de régie
 * depuis la demande elle-même.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Techniciens - WiFiCare',
};

/**
 * Au-delà de ce délai, un technicien déclaré en ligne est tenu pour injoignable.
 *
 * La disponibilité est une intention, pas une preuve : elle survit à la
 * fermeture de l'application, ce qui est voulu, mais elle survit aussi à un
 * téléphone qui n'a plus de batterie. Sans ce seuil, un technicien en panne
 * resterait « en ligne » pour toujours et la régie n'aurait aucun moyen de le
 * savoir.
 */
const REACHABLE_AFTER_MS = 15 * 60_000;

const PRIORITY_BADGE: Record<Priority, string> = {
  URGENT: 'badge-error',
  HIGH: 'badge-warning',
  NORMAL: 'badge-neutral',
  LOW: 'badge-neutral',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: 'Urgente',
  HIGH: 'Haute',
  NORMAL: 'Normale',
  LOW: 'Faible',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
};

const STATUS_BADGE: Record<UserStatus, string> = {
  ACTIVE: 'badge-success',
  INACTIVE: 'badge-neutral',
  SUSPENDED: 'badge-danger',
};

export default async function TechniciansPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!isSuperAdmin(session.user.role)) {
    redirect('/');
  }

  const [technicians, queue] = await Promise.all([
    listTechnicians(),
    listDispatchQueue(),
  ]);

  const online = technicians.filter(
    (technician) => technician.isOnline && technician.status === 'ACTIVE'
  );
  const unanswered = technicians.reduce(
    (total, technician) => total + technician.pendingOffers,
    0
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h1>Techniciens</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Qui peut prendre une demande, et ce qui attend encore un technicien.
          </p>
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginTop: '0', marginBottom: '24px' }}>
        <div className="kpi-card">
          <div className="label">En ligne</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>
            {online.length}
          </div>
          <div className="kpi-trend neutral">
            {online.length === 0
              ? 'Aucune demande ne peut partir'
              : `${online.filter(isReachable).length} joignables`}
          </div>
        </div>

        <div className="kpi-card">
          <div className="label">Hors ligne</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>
            {technicians.length - online.length}
          </div>
          <div className="kpi-trend neutral">Ne reçoivent aucune demande</div>
        </div>

        <div className="kpi-card">
          <div className="label">En circulation</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>
            {queue.length}
          </div>
          <div className="kpi-trend neutral">
            {queue.length === 0 ? 'File vide' : 'Sans technicien'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="label">Propositions en attente</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>
            {unanswered}
          </div>
          <div className="kpi-trend neutral">Techniciens n&apos;ont pas répondu</div>
        </div>
      </div>

      {/* Alerte explicite : le cas « personne en ligne » est celui où la demande
          ne peut pas partir du tout, et un tableau vide ne le dirait pas. */}
      {queue.length > 0 && online.length === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '24px' }}>
          Aucun technicien n&apos;est en ligne : {queue.length} demande
          {queue.length > 1 ? 's' : ''} attend
          {queue.length > 1 ? 'ent' : ''} qu&apos;un technicien se mette en ligne.
        </div>
      )}

      <div className="data-table-wrapper" style={{ marginTop: '24px' }}>
        <div className="data-table-header">
          <h3>Demandes en circulation ({queue.length})</h3>
          <span className="body-s" style={{ color: 'var(--text-secondary)' }}>
            Ordre de priorité, puis d&apos;ancienneté.
          </span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Priorité</th>
                <th>Client / Zone</th>
                <th>Créée</th>
                <th>Vagues</th>
                <th>En attente</th>
                <th>Sans réponse</th>
                <th>Refusées</th>
                <th style={{ width: '40px' }}>
                  <span className="sr-only">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <strong>{ticket.reference}</strong>
                    <div className="body-s" style={{ color: 'var(--text-secondary)' }}>
                      {ticket.type}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${PRIORITY_BADGE[ticket.priority]}`}>
                      {PRIORITY_LABEL[ticket.priority]}
                    </span>
                  </td>
                  <td>
                    <div className="cell-text">{ticket.clientName ?? '—'}</div>
                    <div className="body-s" style={{ color: 'var(--text-secondary)' }}>
                      {ticket.zoneName}
                    </div>
                  </td>
                  <td className="cell-text">{relativeTime(ticket.createdAt)}</td>
                  <td className="cell-text">{ticket.dispatchRound}</td>
                  <td className="cell-text">{ticket.pending}</td>
                  <td className="cell-text">{ticket.lapsed}</td>
                  <td className="cell-text">{ticket.declined}</td>
                  <td>
                    <Link href={`/tickets/${ticket.id}`} className="btn btn-secondary btn-sm">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}

              {queue.length === 0 && (
                <tr>
                  <td colSpan={9} className="table-empty" style={{ color: 'var(--text-secondary)' }}>
                    Aucune demande n&apos;attend de technicien. Tout ce qui a été
                    signalé a été pris en charge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="data-table-wrapper" style={{ marginTop: '24px' }}>
        <div className="data-table-header">
          <h3>Équipe ({technicians.length})</h3>
          <span className="body-s" style={{ color: 'var(--text-secondary)' }}>
            La disponibilité est posée par le technicien depuis son application.
          </span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Technicien</th>
                <th>Téléphone</th>
                <th>Disponibilité</th>
                <th>Dernier contact</th>
                <th>En cours</th>
                <th>Propositions</th>
                <th>Compte</th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((technician) => {
                return (
                  <tr key={technician.id}>
                    <td className="cell-text">{technician.name ?? '—'}</td>
                    <td className="cell-text">{technician.phone}</td>
                    <td>
                      {!technician.assignable ? (
                        <span className="badge badge-neutral">Compte désactivé</span>
                      ) : technician.isOnline ? (
                        isReachable(technician) ? (
                          <span className="badge badge-success">En ligne</span>
                        ) : (
                          <span className="badge badge-warning">En ligne, injoignable</span>
                        )
                      ) : (
                        <span className="badge badge-neutral">Hors ligne</span>
                      )}
                    </td>
                    <td className="cell-text">
                      {technician.lastSeenAt
                        ? relativeTime(technician.lastSeenAt)
                        : 'Jamais'}
                    </td>
                    <td className="cell-text">{technician.openTickets}</td>
                    <td className="cell-text">{technician.pendingOffers}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[technician.status]}`}>
                        {STATUS_LABEL[technician.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {technicians.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty" style={{ color: 'var(--text-secondary)' }}>
                    Aucun compte technicien n&apos;existe encore.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Le téléphone de ce technicien répond-il encore ?
 *
 * Distingue un technicien disponible d'un technicien déclaré disponible dont
 * l'appareil ne parle plus au serveur depuis un quart d'heure. Les deux figurent
 * dans la répartition, et seuls les différents que le second ne répond pas.
 */
function isReachable(technician: {
  lastSeenAt: Date | null;
}): boolean {
  return (
    technician.lastSeenAt !== null &&
    Date.now() - technician.lastSeenAt.getTime() < REACHABLE_AFTER_MS
  );
}

/**
 * Durée écoulée, en français, à la granularité utile.
 *
 * Les durées sont posées ici plutôt que par un composant : le même mot doit
 * vouloir dire la même chose dans les deux tableaux de la page, et un lecteur
 * qui lit « 3 min » dans la file puis « 3 minutes » dans l'équipe ne peut pas
 * les comparer.
 */
function relativeTime(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));

  if (seconds < 60) {
    return 'à l’instant';
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `il y a ${hours} h`;
  }

  return `il y a ${Math.round(hours / 24)} j`;
}