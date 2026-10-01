/** Indicatif utilisé quand le numéro est saisi en format local (10 chiffres). */
const DEFAULT_COUNTRY_CODE = "225";

/**
 * Forme canonique d'un numéro de téléphone : uniquement des chiffres, avec
 * l'indicatif pays.
 *
 * `+225 07 07 07 07 07`, `2250707070707` et `0707070707` désignent ainsi le
 * même compte : sans cela, une connexion depuis l'application mobile créait un
 * doublon d'utilisateur au lieu de retrouver le dossier existant.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");

  if (digits.length === 10) {
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  return digits;
}

/**
 * Formes acceptées en base pour un numéro saisi : la forme canonique et son
 * variante préfixée par `+` (historique du jeu de démo).
 */
export function phoneCandidates(raw: string): string[] {
  const canonical = normalizePhone(raw);

  return canonical ? [canonical, `+${canonical}`] : [];
}