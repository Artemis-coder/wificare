import {
  DEFAULT_COUNTRY,
  splitInternationalNumber,
  type PhoneCountry,
} from "./phone-countries";

/**
 * Forme canonique d'un numéro de téléphone : uniquement des chiffres, avec
 * l'indicatif pays.
 *
 * `+225 07 07 07 07 07`, `2250707070707` et `0707070707` désignent ainsi le
 * même compte : sans cela, une connexion depuis l'application mobile créait un
 * doublon d'utilisateur au lieu de retrouver le dossier existant.
 *
 * Un numéro qui n'est pas national est rendu tel quel, indicatif compris. La
 * seule exception est le format local du pays par défaut, qui n'apporte aucune
 * information et ne peut donc pas désigner un autre compte : il garde le
 * comportement d'avant le sélecteur de pays.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");

  if (!digits) return "";

  // L'indicatif est déjà là : le numéro est international, on n'y touche pas.
  if (digits.startsWith(DEFAULT_COUNTRY.dial)) return digits;

  if (DEFAULT_COUNTRY.lengths.includes(digits.length)) {
    return `${DEFAULT_COUNTRY.dial}${digits}`;
  }

  return digits;
}

/**
 * Formes acceptées en base pour un numéro saisi : la forme canonique et son
 * variante préfixée par `+` (historique du jeu de démonstration).
 */
export function phoneCandidates(raw: string): string[] {
  const canonical = normalizePhone(raw);

  return canonical ? [canonical, `+${canonical}`] : [];
}

/**
 * Écriture internationalisée d'un numéro saisi, telle que le client l'envoie
 * après avoir choisi son pays : `+2250707070707`.
 *
 * Les API gardent malgré tout `normalizePhone` en entrée : un client plus
 * ancien, ou une saisie faite à la main, peut envoyer un format local.
 */
export function internationalPhone(country: PhoneCountry, raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.startsWith(country.dial)) return `+${digits}`;

  // Un numéro collé avec son indicatif désigne son propre pays, et lui seul :
  // dans ce cas, c'est lui qui fait foi, pas le pays choisi dans le sélecteur.
  if (raw.trimStart().startsWith("+") || raw.trimStart().startsWith("00")) {
    const split = splitInternationalNumber(raw);

    return `+${split.country.dial}${split.digits}`;
  }

  return `+${country.dial}${digits}`;
}