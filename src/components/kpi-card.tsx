/**
 * Carte d'indicateur, dans le gabarit du tableau de bord.
 *
 * L'anatomie est celle de `src/app/page.tsx` — intitulé et icône en tête,
 * chiffre au centre, précision en pied — pour que la même rangée se lise
 * pareil partout. Deux partis pris en découlent.
 *
 * La carte n'est pas un lien. Sur le tableau de bord elle ne l'est pas, et une
 * rangée de six cartes identiques dont trois se cliquent et trois non
 * apprendrait à se méfier : le lien est dans la ligne de tendance, comme celui
 * que le tableau de bord pose déjà sous « Wi-Fi Zones Actives » pour renvoyer
 * vers `/zones?status=PENDING`.
 *
 * Ce que fait le lien dépend de la carte : « 3 zones à valider » est une file
 * de travail, et un chiffre qu'on ne peut pas cliquer oblige à retourner dans
 * la liste et retrouver le filtre. Une carte qui ne décrit aucune partie de la
 * liste — un total d'équipements — reste une simple mesure et le dit.
 */

import Link from 'next/link';

export type KpiTone = 'blue' | 'purple' | 'warning' | 'success';

export function KpiCard({
  label,
  value,
  icon,
  tone = 'blue',
  href,
  action = 'Filtrer la liste',
  note,
  selected = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: KpiTone;
  /** Destination du filtre. Absente, la carte est une simple mesure. */
  href?: string;
  /** Ce qu'on propose de faire, écrit sur le lien de la ligne de tendance. */
  action?: string;
  /** Précision sous le chiffre, pour une carte qui ne filtre rien. */
  note?: string;
  selected?: boolean;
}) {
  return (
    <div className={`kpi-card${selected ? ' kpi-card-selected' : ''}`}>
      <div className="kpi-header">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-icon-wrapper ${tone}`}>{icon}</div>
      </div>

      <div className="kpi-value">{value}</div>

      <div className="kpi-trend neutral">
        {selected ? (
          <>
            {/* Le filtre courant est nommé dans le titre du tableau et rappelé
                ici : la carte se lit une par une, sans le reste de la page. */}
            <span className="kpi-filter-dot" aria-hidden="true" />
            Filtre actif
          </>
        ) : href ? (
          <Link href={href} className="kpi-trend-link">
            {action}
          </Link>
        ) : (
          note
        )}
      </div>
    </div>
  );
}

/**
 * Icône d'indicateur, 24 px, trait de 2 comme le reste de l'interface.
 *
 * Déclarée ici plutôt que répétée dans chaque page : ce sont les mêmes
 * pictogrammes, à la même taille, et les redessiner à chaque usage les ferait
 * diverger au premier ajout.
 */
export function KpiIcon({ path }: { path: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}