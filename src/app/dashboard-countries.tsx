"use client";

import { useId, useState } from "react";
import Link from "next/link";

/**
 * Couverture géographique de la plateforme : où l'application est utilisée.
 *
 * Trois pays sont affichés d'emblée. Un tableau de bord se lit en quelques
 * secondes, et une liste de vingt pays n'en est pas un : elle l'allonge sans rien
 * apprendre de plus à celui qui regarde. Le reste n'est pas perdu pour autant —
 * il est regroupé sur une ligne « autres pays », et s'ouvre d'un clic sur le
 * détail complet, où chaque pays retrouve sa ligne.
 *
 * Le composant ne reçoit que des données déjà calculées et sérialisables : la
 * requête est posée par la page, comme pour les autres blocs du tableau de bord.
 */

/** Ce que la page sait d'un pays, une fois les comptes regroupés. */
export type CountryCoverage = {
  /** ISO 3166-1 alpha-2, ou `null` pour un compte sans pays rattaché. */
  code: string | null;
  /** Drapeau du pays, 🇨🇮. Vide pour un compte sans pays rattaché. */
  flag: string;
  /** Nom du pays en français, « Côte d’Ivoire ». */
  name: string;
  /** Indicatif affiché, « +225 ». Vide pour un compte sans pays rattaché. */
  dial: string;
  /** Comptes enregistrés dans ce pays. */
  accounts: number;
  /** Part de ce pays dans le total des comptes, en pourcentage. */
  share: number;
  /** Connexions réussies depuis la mise en place du suivi. */
  logins: number;
};

/**
 * Pays affichés sans qu'il faille les demander.
 *
 * Trois, et pas deux : le podium complet se lit d'un trait. Au quatrième, on
 * commence à comparer des parts qui se ressemblent — ce que la ligne « autres
 * pays » résume mieux qu'une quatrième ligne.
 */
const HEAD_COUNTRIES = 3;

/**
 * Palette de la barre, de la plus forte part à la plus faible.
 *
 * Reprend les teintes de la marque plutôt qu'un dégradé généré : une part de
 * marché est une donnée, pas une décoration, et la lire ne doit pas demander de
 * deviner la légende. Le quatrième ton est celui du reste, distinct des trois
 * autres par sa valeur et non par sa teinte, pour qu'il se lise comme un reste
 * et pas comme un pays de plus.
 */
const BAR_COLORS = ["var(--geo-1)", "var(--geo-2)", "var(--geo-3)"];

const OTHERS_COLOR = "var(--geo-others)";

const PERCENT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const PLURAL: Record<"connexion" | "compte", [one: string, many: string]> = {
  connexion: ["connexion", "connexions"],
  compte: ["compte", "comptes"],
};

/**
 * Nom accordé au nombre, sans le nombre : « compte » puis « comptes ».
 *
 * Séparé de `usage` parce que les deux appelants n'ont pas la même place à lui
 * faire : une pastille de résumé porte déjà le chiffre en gras et n'a besoin que
 * du nom, une ligne de liste les porte tous les deux.
 */
function noun(count: number, key: keyof typeof PLURAL): string {
  if (count === 0) return PLURAL[key][1];

  return PLURAL[key][count > 1 ? 1 : 0];
}

/** Somme d'une mesure sur un ensemble de pays. */
function total(rows: CountryCoverage[], pick: (row: CountryCoverage) => number) {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}

/**
 * Noms des pays regroupés, pour que « autres pays » dise lesquels.
 *
 * Trois suffisent à identifier la ligne ; au-delà, la liste devient une phrase
 * qui coûte plus de place que les chiffres qu'elle accompagne. Le nombre exact
 * est dans le bouton qui ouvre le détail.
 */
function restNames(rows: CountryCoverage[]): string {
  const names = rows.slice(0, 3).map((row) => row.name);

  return rows.length > 3 ? `${names.join(", ")}…` : names.join(", ");
}

export default function DashboardCountries({
  countries,
}: {
  countries: CountryCoverage[];
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  const head = countries.slice(0, HEAD_COUNTRIES);
  const rest = countries.slice(HEAD_COUNTRIES);

  const accounts = total(countries, (row) => row.accounts);
  const logins = total(countries, (row) => row.logins);
  // La part du reste est la seule mesure des pays sous le podium à rester dans
  // ce composant : comptes et connexions sont calculés par `RestRow`, qui les
  // affiche ligne par ligne.
  const restShare = total(rest, (row) => row.share);

  // Le menu n'a de sens que s'il a quelque chose à montrer : sans pays au-delà
  // du podium, « voir les 0 autres pays » serait un mensonge.
  const hasMore = rest.length > 0;

  return (
    <section className="geo" aria-labelledby="geo-title">
      <header className="geo-header">
        <div className="page-header-text">
          <h3 className="geo-title" id="geo-title">
            Couverture géographique
          </h3>
          <p className="geo-subtitle">
            {hasMore
              ? `Les ${HEAD_COUNTRIES} principaux pays d’usage`
              : "Pays où l'application est utilisée"}
          </p>
        </div>
        <Link href="/admin/utilisateurs" className="btn btn-secondary btn-md">
          Voir les comptes
        </Link>
      </header>

      {countries.length === 0 ? (
        <p className="geo-empty">
          Aucun compte enregistré pour l&apos;instant. La répartition par pays
          apparaîtra dès la première inscription.
        </p>
      ) : (
        <>
          <div className="geo-summary">
            <span className="geo-summary-item">
              <strong>{countries.length}</strong> pays couvert
              {countries.length > 1 ? "s" : ""}
            </span>
            <span className="geo-summary-item">
              <strong>{accounts}</strong> {noun(accounts, "compte")}
            </span>
            <span className="geo-summary-item">
              <strong>{logins}</strong> {noun(logins, "connexion")}
              <span className="geo-summary-hint">depuis le suivi</span>
            </span>
          </div>

          {/* Barres de répartition. Redondantes avec la liste qui les suit, à
              laquelle elles renvoient : la lecture y gagne une comparaison
              immédiate des parts, la liste gardant le détail. D'où
              `aria-hidden` — un lecteur d'écran parcourt la liste, pas des
              rectangles colorés.

              Le segment du reste reste affiché que le détail soit ouvert ou non :
              le retirer remplirait la barre avec les trois premiers pays, qui
              alors paraîtraient peser tout le total. */}
          <div className="geo-bar" aria-hidden="true">
            {head.map((row, index) => (
              <span
                key={row.code ?? "unknown"}
                className="geo-bar-segment"
                style={{
                  flexGrow: row.share,
                  backgroundColor: BAR_COLORS[index],
                }}
              />
            ))}
            {hasMore && (
              <span
                className="geo-bar-segment"
                style={{ flexGrow: restShare, backgroundColor: OTHERS_COLOR }}
              />
            )}
          </div>

          {/* `id` sur la liste, jamais sur une seconde : le bouton qui la déplie doit
              pointer vers quelque chose qui existe dans les deux états. */}
          <ul className="geo-list" id={listId}>
            {head.map((row, index) => (
              <CountryRow key={row.code ?? "unknown"} row={row} index={index} />
            ))}

            {open
              ? rest.map((row, index) => (
                  <CountryRow
                    key={row.code ?? "unknown"}
                    row={row}
                    index={HEAD_COUNTRIES + index}
                  />
                ))
              : hasMore && <RestRow rows={rest} />}
          </ul>

          {hasMore && (
            /* `aria-expanded` et `aria-controls` font dire à un lecteur d'écran
               ce que le bouton va faire et où : sans eux, le détail qui apparaît
               n'est rattaché à rien. */
            <button
              type="button"
              className="geo-toggle"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((value) => !value)}
            >
              <svg
                className="geo-toggle-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points={open ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
              </svg>
              {open
                ? "Réduire le détail"
                : `Voir le détail des ${rest.length} autre${rest.length > 1 ? "s" : ""} pays`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Une ligne de pays : rang, drapeau, identité, part, comptes, connexions.
 *
 * `index` porte la teinte : le classement et la barre de répartition doivent
 * parler du même pays dans la même couleur, sans quoi la lecture de l'une
 * contredit celle de l'autre.
 */
function CountryRow({
  row,
  index,
}: {
  row: CountryCoverage;
  index: number;
}) {
  return (
    <li className="geo-row">
      <span className="geo-rank" aria-hidden="true">
        {index + 1}
      </span>
      <span className="geo-flag" aria-hidden="true">
        {row.flag || "🌐"}
      </span>
      <span className="geo-name">
        {row.name}
        {row.dial && <span className="geo-dial">{row.dial}</span>}
      </span>
      <span className="geo-track" aria-hidden="true">
        <span
          className="geo-fill"
          style={{
            width: `${row.share}%`,
            backgroundColor: BAR_COLORS[index] ?? OTHERS_COLOR,
          }}
        />
      </span>
      <span className="geo-count">
        <span className="geo-count-value">{row.accounts}</span>{" "}
        {noun(row.accounts, "compte")}
      </span>
      <span className="geo-share">{PERCENT.format(row.share / 100)}</span>
      <span className="geo-logins">
        {row.logins} {noun(row.logins, "connexion")}
      </span>
    </li>
  );
}

/**
 * Ligne unique qui tient lieu de tous les pays sous le podium.
 *
 * Elle porte les mêmes colonnes qu'une ligne de pays, et le même total que la
 * somme de celles qu'elle remplacerait : c'est bien la même information, à la
 * ligne près.
 */
function RestRow({ rows }: { rows: CountryCoverage[] }) {
  const accounts = total(rows, (row) => row.accounts);
  const share = total(rows, (row) => row.share);
  const logins = total(rows, (row) => row.logins);

  return (
    <li className="geo-row geo-row-rest">
      <span className="geo-rank" aria-hidden="true">
        +
      </span>
      <span className="geo-flag" aria-hidden="true">
        🌍
      </span>
      <span className="geo-name">
        {rows.length} autre{rows.length > 1 ? "s" : ""} pays
        <span className="geo-dial">{restNames(rows)}</span>
      </span>
      <span className="geo-track" aria-hidden="true">
        <span
          className="geo-fill"
          style={{ width: `${share}%`, backgroundColor: OTHERS_COLOR }}
        />
      </span>
      <span className="geo-count">
        <span className="geo-count-value">{accounts}</span>{" "}
        {noun(accounts, "compte")}
      </span>
      <span className="geo-share">{PERCENT.format(share / 100)}</span>
      <span className="geo-logins">
        {logins} {noun(logins, "connexion")}
      </span>
    </li>
  );
}