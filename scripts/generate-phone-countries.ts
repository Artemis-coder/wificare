/**
 * Génère les données de numérotation téléphonique partagées par le back-office
 * et l'application mobile.
 *
 *   npm run phones:generate
 *
 * Les règles de numérotation ne s'écrivent pas à la main : elles sont lues dans
 * les métadonnées publiées par `libphonenumber-js` (ITU / Wikipédia), puis
 * transcrites dans deux formats — TypeScript pour `src/lib/`, Dart pour
 * `mobile/lib/`. Les deux plateformes vérifient donc le même numéro de la même
 * façon, ce qui importait avant qu'elles aient chacune leur implémentation.
 *
 * `libphonenumber-js` est une dépendance de développement : elle n'est jamais
 * embarquée dans l'application. Les fichiers générés sont versionnés, et
 * `npm run phones:generate` n'est à relancer que pour rafraîchir les règles
 * d'un pays.
 *
 * Ce que le script produit, pour chaque pays :
 *
 * - l'indicatif pays et le nom en français (`Intl`, donc « Côte d'Ivoire ») ;
 * - les longueurs admises pour un numéro national, prises dans le type *mobile*
 *   du plan et, à défaut, dans l'ensemble du plan ;
 * - les préfixes mobiles de deux chiffres, lus sur l'expression régulière du
 *   type mobile ;
 * - un numéro d'exemple déjà écrit comme l'utilisateur l'écrira, obtenu en
 *   appliquant au numéro d'exemple du plan sa règle d'écriture nationale.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

type Metadata = {
  version: number;
  countries: Record<string, unknown[]>;
};

/** Index des champs d'un pays dans les métadonnées, version 4 du format. */
const FIELD_CALLING_CODE = 0;
const FIELD_NATIONAL_PREFIX = 5;
const FIELD_PLAN_LENGTHS = 3;
const FIELD_FORMATS = 4;
const FIELD_TYPES = 11;

/** Position du type mobile dans le tableau des types. */
const TYPE_MOBILE = 1;

/**
 * Préfixes mobiles retenus au-delà de ce nombre : la donnée grossit pour rien,
 * et un plan à des centaines de préfixes (Amérique du Nord) n'apporte rien à
 * une vérification de longueur.
 */
const MAX_PREFIXES = 40;

type Entry = {
  code: string;
  name: string;
  dial: string;
  trunk: string;
  lengths: number[];
  prefixes: string[];
  example: string;
};

const display = new Intl.DisplayNames(["fr"], { type: "region" });

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Longueurs admises pour un numéro national.
 *
 * Le plan entier est trop permissif là où il vaut mieux l'être : l'Allemagne
 * accepte de 4 à 15 chiffres parce que ses numéros de service y entrent, et
 * refuser un numéro parce qu'il en fait 9 n'apporterait rien. Le type mobile
 * est la longueur que l'utilisateur tape réellement ; le plan entier ne sert
 * que de repli, pour les pays sans type mobile déclaré.
 */
function lengthsOf(metadata: unknown[]): number[] {
  const types = metadata[FIELD_TYPES] as unknown[][] | undefined;
  const mobile = types?.[TYPE_MOBILE];
  const declared = (mobile?.[1] ?? metadata[FIELD_PLAN_LENGTHS]) as number[];

  // Un champ absent est codé `0` dans ces métadonnées, pas `null`.
  if (!Array.isArray(declared)) return [];

  return [...declared].sort((a, b) => a - b);
}

/**
 * Préfixes mobiles de deux chiffres.
 *
 * Un préfixe est retenu quand un numéro qui le porte est reconnu par
 * l'expression régulière du type mobile du pays. Le remplissage se fait avec
 * des zéros, que ces expressions acceptent aussi bien que n'importe quel
 * chiffre.
 */
function mobilePrefixesOf(metadata: unknown[]): string[] {
  const types = metadata[FIELD_TYPES] as unknown[][] | undefined;
  const pattern = types?.[TYPE_MOBILE]?.[0];

  if (typeof pattern !== "string") return [];

  const expression = new RegExp(`^(?:${pattern})$`);
  const lengths = lengthsOf(metadata);
  const prefixes: string[] = [];

  for (let value = 0; value < 100; value += 1) {
    const prefix = String(value).padStart(2, "0");

    const matches = lengths.some((length) =>
      expression.test(prefix + "0".repeat(Math.max(0, length - prefix.length))),
    );

    if (matches) prefixes.push(prefix);
  }

  return prefixes.length > MAX_PREFIXES ? [] : prefixes;
}

/**
 * Préfixe national : le chiffre que l'utilisateur écrit devant son numéro et
 * qui ne fait pas partie du numéro international.
 *
 * En France, `06 12 34 56 78` désigne le numéro `612345678` ; en Côte d'Ivoire,
 * le zéro national fait partie du numéro et n'est pas retiré. Ce sont les
 * métadonnées qui font la différence : seules les entrées dont le préfixe
 * national est déclaré ici l'écrivent devant leur numéro.
 */
function trunkOf(metadata: unknown[]): string {
  const prefix = metadata[FIELD_NATIONAL_PREFIX];

  return typeof prefix === "string" && /^\d+$/.test(prefix) ? prefix : "";
}

/**
 * Écrit un numéro national comme le pays l'écrit.
 *
 * Chaque règle d'écriture du plan associe une expression régulière et un
 * gabarit (« $1 $2 $3 $4 ») ; la première qui correspond au numéro gagne. Sans
 * règle applicable, le numéro est rendu tel quel : mieux vaut des chiffres
 * collés qu'un regroupement inventé.
 */
function formatNational(metadata: unknown[], digits: string): string {
  const formats = metadata[FIELD_FORMATS];

  if (!Array.isArray(formats)) return digits;

  for (const format of formats as unknown[][]) {
    const [pattern, template, leadingDigits] = format as [
      string,
      string,
      string[] | string | undefined,
    ];

    if (typeof pattern !== "string" || typeof template !== "string") continue;

    // Les chiffres significatifs sont une liste de règles dont une seule
    // suffit : c'est ainsi que le plan distingue, par exemple, un numéro
    // mobile d'un numéro fixe tous deux en dix chiffres.
    const leading = Array.isArray(leadingDigits)
      ? leadingDigits
      : leadingDigits
        ? [leadingDigits]
        : [];

    const applies = leading.some(
      (rule) => new RegExp(`^(?:${rule})`).test(digits),
    );

    if (leading.length > 0 && !applies) continue;

    const matched = new RegExp(`^(?:${pattern})$`).exec(digits);

    if (!matched) continue;

    const groups = matched.slice(1).map((group) => group ?? "");

    // Le zéro national s'écrit devant le numéro dans les pays qui le
    // déclarent ; il rejoint donc le premier groupe.
    if (trunkOf(metadata) === "0") groups[0] = `0${groups[0]}`;

    return template.replace(
      /\$(\d)/g,
      (_, group: string) => groups[Number(group) - 1] ?? "",
    );
  }

  return digits;
}

function build(
  code: string,
  metadata: unknown[],
  exampleDigits: string,
): Entry | null {
  const lengths = lengthsOf(metadata);

  if (lengths.length === 0 || !exampleDigits) return null;

  const callingCode = metadata[FIELD_CALLING_CODE];

  if (typeof callingCode !== "string") return null;

  // Le numéro d'exemple doit être un numéro national du pays : les données
  // publishing examples par type, et l'on ne prend que le mobile.
  if (!lengths.includes(exampleDigits.length)) return null;

  return {
    code,
    name: display.of(code) ?? code,
    dial: callingCode,
    trunk: trunkOf(metadata),
    lengths,
    prefixes: mobilePrefixesOf(metadata),
    example: formatNational(metadata, exampleDigits),
  };
}

function toTypeScript(entries: Entry[]): string {
  const rows = entries
    .map(
      (entry) =>
        `  { code: ${JSON.stringify(entry.code)}, name: ${JSON.stringify(
          entry.name,
        )}, dial: ${JSON.stringify(entry.dial)}, trunk: ${JSON.stringify(
          entry.trunk,
        )}, lengths: [${entry.lengths.join(
          ", ",
        )}], prefixes: [${entry.prefixes
          .map((prefix) => JSON.stringify(prefix))
          .join(", ")}], example: ${JSON.stringify(entry.example)} },`,
    )
    .join("\n");

  return `// Fichier généré par scripts/generate-phone-countries.ts — ne pas modifier à la main.

import type { PhoneCountryData } from "./phone-countries";

/** Plans de numérotation de ${entries.length} pays, par nom français. */
export const PHONE_COUNTRIES: PhoneCountryData[] = [
${rows}
];
`;
}

function toDart(entries: Entry[]): string {
  const rows = entries
    .map((entry) => {
      const name = entry.name.replaceAll("'", "\\'").replaceAll("$", "\\$");
      const example = entry.example.replaceAll("$", "\\$");

      return [
        "  PhoneCountryData(",
        `    code: '${entry.code}',`,
        `    name: '${name}',`,
        `    dial: '${entry.dial}',`,
        `    trunk: '${entry.trunk}',`,
        `    lengths: <int>[${entry.lengths.join(", ")}],`,
        `    prefixes: <String>[${entry.prefixes.map((p) => `'${p}'`).join(", ")}],`,
        `    example: '${example}',`,
        "  ),",
      ].join("\n");
    })
    .join("\n");

  return `// Fichier généré par scripts/generate-phone-countries.ts — ne pas modifier à la main.
// ignore_for_file: lines_longer_than_80_chars

import 'phone_country_data.dart';

/// Plans de numérotation de ${entries.length} pays, par nom français.
const List<PhoneCountryData> phoneCountriesData = <PhoneCountryData>[
${rows}
];
`;
}

function main() {
  const metadata = readJson<Metadata>(
    require.resolve("libphonenumber-js/metadata.max.json"),
  );
  const examples = readJson<Record<string, string>>(
    require.resolve("libphonenumber-js/examples.mobile.json"),
  );

  const entries: Entry[] = [];

  for (const [code, countryMetadata] of Object.entries(metadata.countries)) {
    if (!/^[A-Z]{2}$/.test(code)) continue;

    const exampleDigits = examples[code];

    if (!exampleDigits) continue;

    const entry = build(code, countryMetadata, exampleDigits);

    if (entry) entries.push(entry);
  }

  // Tri par nom français : la liste est déjà ordonnée, les deux plateformes se
  // contentent de la parcourir dans cet ordre.
  entries.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  writeFileSync(
    resolve(ROOT, "src/lib/phone-countries.generated.ts"),
    toTypeScript(entries),
  );
  writeFileSync(
    resolve(ROOT, "mobile/lib/src/core/utils/phone_countries.generated.dart"),
    toDart(entries),
  );

  console.log(
    `${entries.length} pays écrits :\n` +
      `  src/lib/phone-countries.generated.ts\n` +
      `  mobile/lib/src/core/utils/phone_countries.generated.dart`,
  );
}

main();