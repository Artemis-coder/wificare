/**
 * Vérifie la vérification des numéros de téléphone.
 *
 *   npm run phones:check
 *
 * Le projet n'a pas de framework de test, mais la règle de numérotation est la
 * seule chose qui empêche un utilisateur d'atteindre son compte : elle mérite
 * des cas reproductibles plutôt qu'un test manuel répété à chaque modification
 * du générateur.
 *
 * Les cas ci-dessous partent des numéros que l'application connaît déjà — les
 * comptes de démonstration — et des pièges de numérotation les plus fréquents :
 * préfixe national en trop, indicatif collé au numéro, longueur d'un autre pays.
 */

import {
  COUNTRIES,
  countriesByDial,
  splitInternationalNumber,
  validateNationalNumber,
  countryByCode,
} from "../src/lib/phone-countries";
import {
  internationalPhone,
  normalizePhone,
  phoneCandidates,
} from "../src/lib/phone";

let failures = 0;

/** Vérifie une valeur obtenue et son motif d'intérêt. */
function check(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) return;

  failures += 1;
  console.error(
    `✗ ${label}\n    attendu : ${expected}\n    obtenu  : ${String(actual)}`,
  );
}

/** Numéro validé, écrit au format international, ou le refus du validateur. */
function accepted(countryCode: string, raw: string): string {
  const result = validateNationalNumber(countryByCode(countryCode), raw);

  return result.ok ? result.e164 : result.message;
}

/** Message de refus du validateur, ou « accepté ». */
function refusal(countryCode: string, raw: string, strict = false): string {
  const result = validateNationalNumber(countryByCode(countryCode), raw, {
    strict,
  });

  return result.ok ? "accepté" : result.message;
}

check(
  "le compte de démonstration se connecte depuis le back-office",
  internationalPhone(countryByCode("CI"), "0909090909"),
  "+2250909090909",
);

check(
  "le même numéro, écrit avec des espaces et son indicatif",
  internationalPhone(countryByCode("CI"), "+225 09 09 09 09 09"),
  "+2250909090909",
);

check(
  "un numéro collé trahit son pays et prime sur le pays choisi",
  internationalPhone(countryByCode("FR"), "+2250909090909"),
  "+2250909090909",
);

check(
  "le préfixe 00 est un indicatif, pas un zéro national",
  internationalPhone(countryByCode("CI"), "00225 09 09 09 09 09"),
  "+2250909090909",
);

check(
  "un numéro français se saisit avec son zéro national",
  accepted("FR", "06 12 34 56 78"),
  "+33612345678",
);

check(
  "et aussi sans lui, que le plan ne compte pas",
  accepted("FR", "612345678"),
  "+33612345678",
);

check(
  "un numéro allemand garde ses deux longueurs",
  accepted("DE", "01512 3456789"),
  "+4915123456789",
);

check(
  "un numéro ivoirien comporte dix chiffres, pas neuf",
  refusal("CI", "070707070"),
  "Un numéro +225 comporte 10 chiffres (vous en avez saisi 9).",
);

check(
  "un numéro sénégalais comporte neuf chiffres",
  refusal("SN", "70123456"),
  "Un numéro +221 comporte 9 chiffres (vous en avez saisi 8).",
);

check(
  "le préfixe mobile n'est vérifié que sur demande",
  refusal("CI", "9909090909", true),
  "Ce numéro ne commence pas par un préfixe mobile +225.",
);

check(
  "et un numéro douteux reste accepté par défaut",
  refusal("CI", "9909090909"),
  "accepté",
);

check(
  "un numéro court est refusé avant toute autre règle",
  refusal("CI", ""),
  "Saisissez votre numéro de téléphone.",
);

check(
  "un préfixe mobile hors plan reste accepté par défaut",
  refusal("CI", "9909090909"),
  "accepté",
);

check(
  "et refusé quand la vérification stricte est demandée",
  refusal("CI", "9909090909", true),
  "Ce numéro ne commence pas par un préfixe mobile +225.",
);

check(
  "le format local ivoirien reste accepté sans indicatif",
  normalizePhone("0909090909"),
  "2250909090909",
);

check(
  "et il ne se dédouble pas s'il porte déjà son indicatif",
  phoneCandidates("+2250909090909").join(","),
  "2250909090909,+2250909090909",
);

check(
  "un numéro indéterminé ne devient pas le compte d'un autre pays",
  internationalPhone(countryByCode("FR"), "712345678"),
  "+33712345678",
);

check(
  "un numéro nord-américain est attribué à un pays de l'indicatif 1",
  splitInternationalNumber("+12015550123").country.dial,
  "1",
);

check(
  "et ses dix chiffres restent entiers",
  splitInternationalNumber("+12015550123").digits,
  "2015550123",
);

check(
  "un indicatif inconnu ne se décompose pas",
  splitInternationalNumber("+9991234567").country.code,
  countryByCode("CI").code,
);

check(
  "un indicatif de trois chiffres n'est pas confondu avec son préfixe",
  splitInternationalNumber("+2250909090909").country.code,
  "CI",
);

console.log(
  [
    `${COUNTRIES.length} pays, ${countriesByDial("1").length} d'entre eux sous l'indicatif 1`,
    failures === 0 ? "tous les cas sont conformes" : `${failures} cas en échec`,
  ].join("\n"),
);

process.exit(failures === 0 ? 0 : 1);