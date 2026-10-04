import { prisma } from '@/lib/prisma';
import { TicketStatus, type Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import TicketRow from './ticket-row';
import { canUseBackoffice } from '@/lib/roles';
import { KpiCard, KpiIcon } from '@/components/kpi-card';

/**
 * Gestion des demandes.
 *
 * Les indicateurs sont des filtres. Un compte se compte sur une liste de vingt
 * lignes, et « 4 à traiter » est une file de travail autant qu'un chiffre : le
 * renvoyer dans la liste obligerait à retrouver le bon filtre, et le tableau
 * n'en propose aucun — le champ de recherche et le bouton « Filtrer » qui
 * encadrent la liste n'avaient ni état ni gestionnaire, et ne faisaient donc rien.
 *
 * Le filtre vit dans l'URL, pas dans le tableau : la requête est alors rejouée
 * côté serveur, la liste affichée ne contient que les lignes du filtre, et
 * l'adresse se copie telle quelle. Le filtre borne aussi ce que la page
 * chargeait avant, toutes les demandes de la plateforme sans limite.
 */

export const dynamic = 'force-dynamic';

/**
 * Les filtres de la page, dans l'ordre où la régie les utilise.
 *
 * Les statuts sont regroupés par étape du travail et non listés un par un :
 * douze statuts feraient douze boutons, et personne ne choisit « CONFIRMED »
 * dans une liste — on choisit « en cours ».
 */
const FILTERS = {
  ALL: {
    label: 'Toutes',
    // À zéro, le français s'accorde au singulier : « aucun ticket urgent », jamais
    // « aucun ticket urgentes ». Dérivé de l'intitulé, il le ferait écrire de travers.
    empty: 'Aucun ticket trouvé.',
    statuses: null,
    urgent: false,
  },
  TODO: {
    label: 'À traiter',
    empty: 'Aucun ticket à traiter.',
    statuses: [TicketStatus.NEW, TicketStatus.TO_VERIFY],
    urgent: false,
  },
  PROGRESS: {
    label: 'En cours',
    empty: 'Aucun ticket en cours.',
    statuses: [
      TicketStatus.ASSIGNED,
      TicketStatus.CONFIRMED,
      TicketStatus.EN_ROUTE,
      TicketStatus.DIAGNOSING,
      TicketStatus.REPAIRING,
    ],
    urgent: false,
  },
  WAITING: {
    label: 'En attente',
    empty: 'Aucun ticket en attente de paiement.',
    statuses: [TicketStatus.PENDING_QUOTE, TicketStatus.PENDING_PAYMENT],
    urgent: false,
  },
  URGENT: {
    label: 'Urgentes',
    empty: 'Aucun ticket urgent.',
    statuses: null,
    urgent: true,
  },
  DONE: {
    label: 'Clôturées',
    empty: 'Aucun ticket clôturé.',
    statuses: [TicketStatus.COMPLETED, TicketStatus.CLOSED],
    urgent: false,
  },
} as const satisfies Record<
  string,
  {
    label: string;
    empty: string;
    statuses: readonly TicketStatus[] | null;
    urgent: boolean;
  }
>;

type FilterKey = keyof typeof FILTERS;

const FILTER_KEYS = Object.keys(FILTERS) as FilterKey[];

/** Un `?filter=` inconnu retombe sur « Toutes » plutôt que sur une liste vide. */
function parseFilter(value: string | undefined): FilterKey {
  return FILTER_KEYS.includes(value as FilterKey) ? (value as FilterKey) : 'ALL';
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
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

  // Le back-office est réservé à la régie, et `lib/auth.ts` refuse la
  // connexion des autres rôles. Cette portée est la seconde couche : elle décrit
  // ce que la page est autorisée à afficher, pas seulement qui peut l'atteindre,
  // et survit à un assouplissement de la porte d'entrée sans avoir à être réécrite.
  const scope: Prisma.TicketWhereInput =
    session.user.role === 'CLIENT'
      ? { client: { userId: session.user.id } }
      : session.user.role === 'TECHNICIAN'
        ? { technicianId: session.user.id }
        : {};

  const { filter: rawFilter, q } = await searchParams;
  const filter = parseFilter(rawFilter);
  const needle = q?.trim().slice(0, 80) ?? '';

  // La recherche porte sur ce que la régie a sous les yeux : la référence qu'elle
  // communique au client, l'intitulé du problème, la zone et le client. Elle ne
  // descend pas dans la description ni dans le rapport — une recherche qui trouve
  // une demande à partir d'un mot de son rapport d'intervention crée une fuite
  // entre deux personnes qui ne se sont jamais parlées.
  const matches: Prisma.TicketWhereInput = needle
    ? {
        OR: [
          { reference: { contains: needle, mode: 'insensitive' } },
          { type: { contains: needle, mode: 'insensitive' } },
          { wifiZone: { name: { contains: needle, mode: 'insensitive' } } },
          { client: { name: { contains: needle, mode: 'insensitive' } } },
        ],
      }
    : {};

  const active = FILTERS[filter];

  const tickets = await prisma.ticket.findMany({
    where: { ...scope, ...matches, ...ticketFilter(active) },
    orderBy: { createdAt: 'desc' },
    include: {
      client: true,
      wifiZone: true,
      technician: true,
    },
  });

  // Les compteurs ignorent le filtre actif *et* la recherche : ils décrivent le
  // parc, pas la vue. Une carte vidée par la vue se contredit elle-même —
  // « À traiter » afficherait 0 précisément quand on est sur son filtre, et
  // six cartes deviennent des pièges à comparer. Combien la recherche a
  // rapporté tient dans le titre du tableau, à côté de la liste qu'elle filtre.
  const counts = await countByFilter(scope);

  // Une recherche en cours survit au changement de filtre : changer de vue ne
  // doit pas faire perdre ce qu'on cherchait. L'effacement est proposé à part.
  const linkTo = (key: FilterKey) => {
    const params = new URLSearchParams();

    if (key !== 'ALL') params.set('filter', key);
    if (needle) params.set('q', needle);

    const query = params.toString();

    return query ? `/tickets?${query}` : '/tickets';
  };

  const isFiltered = filter !== 'ALL' || needle !== '';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h1>Gestion des tickets</h1>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>
            Suivez et gérez toutes les interventions sur vos Wi-Fi Zones.
          </p>
        </div>
        <Link href="/tickets/new" className="btn btn-primary btn-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouveau ticket
        </Link>
      </div>

      <div className="dashboard-grid">
        {FILTER_KEYS.map((key) => {
          const meta = FILTERS[key];

          return (
            <KpiCard
              key={key}
              label={meta.label}
              value={counts[key]}
              tone={TONE[key]}
              icon={<KpiIcon path={ICON[key]} />}
              href={linkTo(key)}
              selected={filter === key}
            />
          );
        })}
      </div>

      <div className="data-table-wrapper" style={{ marginTop: '24px' }}>
        <div className="data-table-header">
          <h3>
            {filter === 'ALL' ? 'Tous les tickets' : FILTERS[filter].label}
            {needle && <span className="table-count-note"> · « {needle} »</span>}{' '}
            ({tickets.length})
          </h3>

          {/* Formulaire GET plutôt qu'un champ contrôlé : la recherche ne dépend
              d'aucun JavaScript, se partage par son adresse, et le bouton
              « Filtrer » devient enfin ce qu'il dit. Le filtre courant passe en
              champ caché — sans lui, chercher dans une vue filtrée reviendrait
              au filtre « Toutes ». */}
          <form method="get" action="/tickets" className="filter-row">
            {filter !== 'ALL' && <input type="hidden" name="filter" value={filter} />}
            <input
              type="search"
              name="q"
              className="field field-wide"
              placeholder="Référence, zone, client…"
              aria-label="Rechercher un ticket"
              defaultValue={needle}
            />
            <button type="submit" className="btn btn-secondary btn-md">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filtrer
            </button>
            {isFiltered && (
              <Link href="/tickets" className="btn btn-secondary btn-md">
                Tout afficher
              </Link>
            )}
          </form>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Date</th>
                <th>Client / Zone</th>
                <th>Problème</th>
                <th>Priorité</th>
                <th>Technicien</th>
                <th>Statut</th>
                {/* Colonne vide réservée au chevron : elle indique que la
                    ligne entière mène au détail. */}
                <th style={{ width: '40px' }}>
                  <span className="sr-only">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}

              {tickets.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty" style={{ color: 'var(--text-secondary)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.5 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    {needle
                      ? `Aucun ticket ne correspond à « ${needle} ».`
                      : active.empty}
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

/** Clause Prisma d'un filtre de la page. */
function ticketFilter(filter: (typeof FILTERS)[FilterKey]): Prisma.TicketWhereInput {
  if (filter.urgent) return { priority: 'URGENT' };
  if (!filter.statuses) return {};

  return { status: { in: [...filter.statuses] } };
}

/**
 * Compte chaque filtre en une requête.
 *
 * Un `count` par filtre serait six requêtes qui reviendraient toutes au même
 * nombre total. `groupBy` les tire en une seule, et les filtres à statut
 * se regroupent naturellement ; seule la priorité urgente demande son propre
 * compte, puisqu'elle coupe à travers tous les statuts.
 */
async function countByFilter(
  scope: Prisma.TicketWhereInput
): Promise<Record<FilterKey, number>> {
  const [byStatus, urgent] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    prisma.ticket.count({ where: { ...scope, priority: 'URGENT' } }),
  ]);

  const perStatus = new Map(byStatus.map((row) => [row.status, row._count._all]));

  const sum = (statuses: readonly TicketStatus[] | null) =>
    statuses
      ? statuses.reduce((total, status) => total + (perStatus.get(status) ?? 0), 0)
      : byStatus.reduce((total, row) => total + row._count._all, 0);

  return {
    ALL: sum(null),
    TODO: sum(FILTERS.TODO.statuses),
    PROGRESS: sum(FILTERS.PROGRESS.statuses),
    WAITING: sum(FILTERS.WAITING.statuses),
    URGENT: urgent,
    DONE: sum(FILTERS.DONE.statuses),
  };
}

/** Teinte par filtre : l'ordre des filtres suit l'urgence qu'ils décrivent. */
const TONE: Record<FilterKey, 'blue' | 'purple' | 'warning' | 'success'> = {
  ALL: 'blue',
  TODO: 'purple',
  PROGRESS: 'blue',
  WAITING: 'warning',
  URGENT: 'warning',
  DONE: 'success',
};

/** Pictogramme par filtre. */
const ICON: Record<FilterKey, string> = {
  ALL: 'M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 7h6M9 12h6M9 17h4',
  TODO: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  PROGRESS: 'M23 4l-6 6M1 20l7-7M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  WAITING: 'M12 8v4l3 3M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z',
  URGENT: 'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  DONE: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
};
