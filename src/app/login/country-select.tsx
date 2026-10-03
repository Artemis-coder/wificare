"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  COUNTRIES,
  countryFlag,
  countryByCode,
  type PhoneCountry,
} from "@/lib/phone-countries";

/**
 * Sélecteur de pays posé devant un champ de numéro.
 *
 * Le `<select>` natif ne convient pas ici : ses options affichent leur texte
 * partout, donc un nom de pays complet tiendrait la moitié de la carte — et un
 * nom qui déborde d'un contrôle tronqué n'est plus le nom du pays choisi. La
 * liste affiche donc le nom complet, et le champ fermé se réduit à ce que
 * l'utilisateur reconnaît de son numéro : drapeau et indicatif. Le nom reste
 * dans l'infobulle du champ et dans le nom accessible, ce qui sert aux pays
 * qui partagent un indicatif — le 1 pour l'Amérique du Nord, le 44 pour les
 * îles britanniques.
 *
 * Les 245 pays rendent la recherche indispensable : « ci », « 225 », « sn »
 * mènent chacun de leur côté, et personne ne fait défiler une liste de cette
 * longueur pour trouver son pays.
 */
export default function CountrySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const wrapper = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const country = countryByCode(value);

  const results = useMemo(() => filter(query), [query]);

  useEffect(() => {
    if (!open) return;

    // Le clic en dehors referme, comme referait n'importe quelle liste native :
    // une liste qui reste ouverte derrière le reste de la page est un écran
    // coincé.
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);

    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    search.current?.focus();
  }, [open]);

  const openPanel = () => {
    // La première ligne est présélectionnée : Enter valide donc le pays qui
    // vient d'être cherché, au lieu de ne rien faire.
    setHighlight(0);
    setOpen(true);
  };

  const choose = (option: PhoneCountry) => {
    onChange(option.code);
    setOpen(false);
    setQuery("");
    // Le focus revient sur le bouton : sans cela, il se perd dans le document et
    // la tabulation repart du début de la page.
    button.current?.focus();
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlight((index) => Math.min(index + 1, results.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlight((index) => Math.max(index - 1, 0));
        break;
      case "Enter": {
        const option = results[highlight];
        if (option) {
          event.preventDefault();
          choose(option);
        }
        break;
      }
      case "Escape":
        event.preventDefault();
        setOpen(false);
        button.current?.focus();
        break;
    }
  };

  return (
    <div className="country-picker" ref={wrapper}>
      <button
        type="button"
        ref={button}
        className="field country-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Pays du numéro de téléphone : ${country.name}`}
        title={`${country.name} ${country.dialLabel}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openPanel();
          }
        }}
      >
        <span aria-hidden="true">{countryFlag(country.code)}</span>
        <span>{country.dialLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div className="country-panel">
          <input
            ref={search}
            type="search"
            className="field country-search"
            placeholder="Rechercher un pays ou un indicatif"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onListKeyDown}
          />

          {results.length === 0 ? (
            <p className="country-empty">Aucun pays ne correspond.</p>
          ) : (
            <ul id={listId} role="listbox" className="country-list">
              {results.map((option, index) => (
                <li key={option.code} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.code === country.code}
                    className="country-option"
                    data-highlighted={index === highlight || undefined}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(option)}
                  >
                    <span className="country-option-flag" aria-hidden="true">{countryFlag(option.code)}</span>
                    <span className="country-option-name">{option.name}</span>
                    <span className="country-option-dial">{option.dialLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pays correspondant à une recherche : nom, indicatif ou code ISO.
 *
 * « sen » doit trouver « Sénégal » : les lettres sans accent sont ce que
 * l'utilisateur tape sur un clavier où il n'en a pas besoin, et un pays
 * introuvable est un pays qu'il croira absent de la liste.
 */
function filter(query: string): readonly PhoneCountry[] {
  const search = fold(query.trim());

  if (!search) return COUNTRIES;

  return COUNTRIES.filter(
    (country) =>
      fold(country.name).includes(search) ||
      country.dial.includes(search) ||
      fold(country.code).includes(search),
  );
}

/** Retire la casse et les accents d'une recherche. */
function fold(value: string): string {
  // `NFD` décompose « é » en « e » + accent, qu'il suffit alors de retirer.
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}