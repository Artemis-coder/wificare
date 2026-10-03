/**
 * Pays, indicatifs et vérification d'un numéro de téléphone.
 *
 * Le back-office ne connaît pas qu'un pays : la numérotation est un attribut du
 * pays de l'abonné, et un numéro vérifié selon les règles d'un autre pays est un
 * numéro que le serveur refusera. Ce module est donc la source unique des deux
 * informations — quel pays, et quelles sont les règles de son plan — pour l'écran
 * de connexion comme pour les API.
 *
 * Les données viennent de `phone-countries.generated.ts`, produit par
 * `npm run phones:generate` à partir des plans de numérotation publiés
 * (ITU / Wikipédia) ; l'application mobile lit le même jeu de données, généré
 * dans le même temps, et les deux vérifient donc un numéro de la même façon.
 */

import { PHONE_COUNTRIES } from "./phone-countries.generated";

/**
 * Pays retenu quand la saisie ne le dit pas : la Côte d'Ivoire, seule
 * numérotation que l'application connaissait avant que le sélecteur existe. Les
 * numéros déjà enregistrés en base sont ivoiriens ; les faire passer par une
 * autre règle les rendrait introuvables.
 */
export const DEFAULT_COUNTRY_CODE = "CI";

/** Plan de numérotation d'un pays, tel que produit par le générateur. */
export type PhoneCountryData = {
  /** ISO 3166-1 alpha-2, « CI ». */
  code: string;
  /** Nom du pays en français, « Côte d’Ivoire ». */
  name: string;
  /** Indicatif pays sans « + », « 225 ». */
  dial: string;
  /**
   * Préfixe national écrit devant le numéro par les subscribers du pays, « 0 »
   * en France, absent en Côte d'Ivoire où le zéro fait partie du numéro. Vide
   * quand le pays n'en déclare pas.
   */
  trunk: string;
  /** Longueurs admises pour un numéro national, sans indicatif ni préfixe. */
  lengths: number[];
  /**
   * Préfixes mobiles du pays ; vide quand le plan en publie trop pour être
   * utile.
   *
   * Ils ne servent qu'à la vérification stricte, jamais à un avertissement :
   * un plan classe certains numéros valides hors de ses plages mobiles — le
   * `09` ivoirien des comptes de démonstration en est un — et annoncer à
   * l'utilisateur que son propre numéro est suspect serait faux.
   */
  prefixes: string[];
  /** Numéro national d'exemple, écrit comme l'utilisateur l'écrira. */
  example: string;
};

export type PhoneCountry = PhoneCountryData & {
  /** Drapeau du pays, 🇨🇮. */
  flag: string;
  /** Indicatif affiché, « +225 ». */
  dialLabel: string;
};

/** Raison pour laquelle un numéro est refusé. */
export type PhoneProblem = "empty" | "length" | "prefix";

export type PhoneValidation =
  | {
      ok: true;
      /** Chiffres nationaux retenus, préfixe national retiré s'il était là. */
      digits: string;
      /** Numéro international, « +2250707070707 ». */
      e164: string;
    }
  | {
      ok: false;
      problem: PhoneProblem;
      /** Message affichable, en français. */
      message: string;
    };

/**
 * Drapeau d'un code ISO, construit à partir des deux lettres.
 *
 * Le drapeau est un couple de points de code Unicode : « CI » devient U+1F1E8
 * U+1F1EE. Le calculer évite d'en porter 245 dans les données, et laisse le
 * générateur et l'application parler du même code pays.
 */
export function countryFlag(code: string): string {
  const letters = code.toUpperCase();

  if (!/^[A-Z]{2}$/.test(letters)) return "🏳";

  return String.fromCodePoint(
    ...[...letters].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}

/** Tous les pays, par nom français — la liste est déjà ordonnée ainsi. */
export const COUNTRIES: readonly PhoneCountry[] = PHONE_COUNTRIES.map(
  (country) => ({
    ...country,
    flag: countryFlag(country.code),
    dialLabel: `+${country.dial}`,
  }),
);

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

const BY_DIAL = new Map<string, PhoneCountry[]>();

for (const country of COUNTRIES) {
  BY_DIAL.set(country.dial, [...(BY_DIAL.get(country.dial) ?? []), country]);
}

/** Pays par code ISO ; le pays par défaut si le code est inconnu. */
export function countryByCode(code: string): PhoneCountry {
  return BY_CODE.get(code.toUpperCase()) ?? BY_CODE.get(DEFAULT_COUNTRY_CODE)!;
}

/**
 * Pays partageant un indicatif.
 *
 * Plusieurs pays partagent un indicatif — le 1 pour l'Amérique du Nord, le 44
 * pour les îles britanniques — et un numéro seul ne dit pas lequel des deux
 * c'est. La liste est donc renvoyée entière, et c'est au nombre qui suit de
 * trancher.
 */
export function countriesByDial(dial: string): PhoneCountry[] {
  return BY_DIAL.get(dial.replace(/\D/g, "")) ?? [];
}

/** Pays retenu quand aucun n'est indiqué. */
export const DEFAULT_COUNTRY: PhoneCountry = BY_CODE.get(DEFAULT_COUNTRY_CODE)!;

/**
 * Nombre de chiffres d'un pays, en toutes lettres : « 10 chiffres ».
 *
 * Les messages citent l'indicatif plutôt que le nom du pays : « un numéro
 * sénégalais » ou « un numéro de la Côte d'Ivoire » exigent un adjectif et un
 * article que rien ne permet de dériver de deux lettres, alors que `+221` et
 * `+225` sont justes pour les 245 pays.
 */
export function expectedDigitsLabel(country: PhoneCountry): string {
  const words = country.lengths.map((count) =>
    count === 1 ? "1 chiffre" : `${count} chiffres`,
  );

  return words.join(" ou ");
}

/** Retire les caractères qui ne sont pas des chiffres. */
function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Vérifie un numéro national selon le plan du pays choisi.
 *
 * Deux règles, dans cet ordre :
 *
 * - le numéro tel qu'il est écrit doit avoir une longueur admise par le pays ;
 * - à défaut, il est réessayé sans son préfixe national. Un Français tape
 *   `06 12 34 56 78` là où le plan compte neuf chiffres, parce que le zéro
 *   national ne fait pas partie de son numéro : le refuser serait erroné, et
 *   l'utilisateur n'a aucun moyen de le savoir.
 *
 * Les préfixes mobiles ne sont vérifiés que sur demande (`strict`), parce
 * qu'un préfixe faux ferait refuser un numéro valide — bien plus grave qu'un
 * numéro douteux accepté.
 */
export function validateNationalNumber(
  country: PhoneCountry,
  raw: string,
  options: { strict?: boolean } = {},
): PhoneValidation {
  const digits = digitsOf(raw);

  if (!digits) {
    return { ok: false, problem: "empty", message: "Saisissez votre numéro de téléphone." };
  }

  const national = country.trunk && digits.startsWith(country.trunk)
    ? digits.slice(country.trunk.length)
    : digits;

  const length = country.lengths.includes(national.length)
    ? national.length
    : country.lengths.includes(digits.length)
      ? digits.length
      : null;

  if (length === null) {
    return {
      ok: false,
      problem: "length",
      message: `Un numéro ${country.dialLabel} comporte ${expectedDigitsLabel(country)} (vous en avez saisi ${digits.length}).`,
    };
  }

  const kept = national.length === length ? national : digits;

  if (
    options.strict &&
    country.prefixes.length > 0 &&
    !country.prefixes.some((prefix) => kept.startsWith(prefix))
  ) {
    return {
      ok: false,
      problem: "prefix",
      message: `Ce numéro ne commence pas par un préfixe mobile ${country.dialLabel}.`,
    };
  }

  return { ok: true, digits: kept, e164: `+${country.dial}${kept}` };
}

/**
 * Sépare l'indicatif d'un numéro déjà écrit au format international.
 *
 * Le pays est celui dont le plan accepte la longueur du reste du numéro ; sans
 * accord possible, le premier pays de l'indicatif est retenu, ce qui importe peu
 * : les pays d'un même indicatif partagent les mêmes longueurs.
 */
export function splitInternationalNumber(raw: string): {
  country: PhoneCountry;
  digits: string;
} {
  // `00` est l'indicatif international écrit en préfixe, pas un chiffre du
  // numéro : sans cette lecture, `00225 07 07…` serait pris pour un numéro de
  // douze chiffres d'un pays que personne n'a.
  const digits = digitsOf(raw).replace(/^00/, "");

  if (!digits) return { country: DEFAULT_COUNTRY, digits: "" };

  // L'indicatif le plus long d'abord : « 225 » avant « 22 », sans quoi un pays
  // serait reconnu aux deux premiers chiffres de son voisin.
  for (let size = 4; size >= 1; size -= 1) {
    const candidates = countriesByDial(digits.slice(0, size));

    if (candidates.length === 0) continue;

    const national = digits.slice(size);
    const fits = candidates.find((country) =>
      country.lengths.includes(national.length),
    );

    return { country: fits ?? candidates[0], digits: national };
  }

  return { country: DEFAULT_COUNTRY, digits };
}

/**
 * Chiffres de stockage d'un numéro : indicatif pays suivi du numéro national,
 * sans « + » ni séparateur.
 *
 * C'est la forme que la base contient et que les deux plateformes produisent :
 * elle se lit dans une requête et ne dépend pas de la façon dont l'écran affiche
 * le numéro.
 */
export function toStoragePhone(country: PhoneCountry, raw: string): string {
  const digits = digitsOf(raw);

  if (!digits) return "";

  if (digits.startsWith(country.dial)) return digits;

  return `${country.dial}${digits}`;
}