/**
 * Pays de rattachement d'un compte, et mesure de son activité.
 *
 * Le sélecteur de pays des écrans de connexion et d'inscription n'a jamais
 * rien écrit en base : il ne faisait que choisir le plan de numérotation
 * appliqué au numéro. Le pays d'un compte restait donc porté par le seul
 * indicatif, ce qui est exact mais illisible depuis une requête — impossible de
 * répartir les comptes par pays sans les ramener tous en mémoire.
 *
 * Ce module remplit ce manque par deux entrées, dans cet ordre de préférence :
 *
 * - le pays **déclaré** à l'inscription, quand le client l'envoie. C'est la
 *   source la plus fiable, puisqu'elle vient du choix de l'utilisateur ;
 * - le pays **déduit du numéro** à défaut. L'indicatif est dans le numéro, donc
 *   cette méthode rattrape les comptes déjà enregistrés et les clients plus
 *   anciens, qui n'envoient rien.
 *
 * Les deux passent par `lib/phone-countries`, source unique des plans de
 * numérotation : un pays déduit ici est celui que l'écran de connexion aurait
 * reconnu pour le même numéro.
 */

import {
  COUNTRIES,
  splitInternationalNumber,
  type PhoneCountry,
} from "./phone-countries";
import { prisma } from "./prisma";

/** ISO 3166-1 alpha-2 des pays que la plateforme connaît, en majuscules. */
const KNOWN_CODES = new Set(COUNTRIES.map((country) => country.code));

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/**
 * Pays connu pour un code ISO lu en base, ou `null` si la colonne ne dit rien
 * d'exploitable.
 *
 * `countryByCode` de `lib/phone-countries` renverrait le pays par défaut pour un
 * code inconnu, ce qui est le bon comportement pour *valider une saisie* et le
 * mauvais pour *afficher une colonne* : un code absent des données deviendrait
 * silencieusement « Côte d'Ivoire ». Ici, l'absence est rendue par `null` et le
 * tableau de bord affiche un pays non renseigné plutôt qu'un drapeau faux.
 */
export function knownCountry(code: string | null): PhoneCountry | null {
  if (!code) return null;

  return BY_CODE.get(code.toUpperCase()) ?? null;
}

/**
 * Pays déduit du numéro stocké d'un compte.
 *
 * `User.phone` est enregistré sans « + » ni séparateur, indicatif en tête, mais
 * la variante historique préfixée par « + » existe encore en base : la lecture
 * ignore donc les caractères non chiffres, ce que fait déjà
 * `splitInternationalNumber`.
 *
 * Un numéro qu'aucun plan ne reconnaît prend le pays par défaut, comme le fait
 * déjà l'écran de connexion. Ce n'est pas une déduction mais une convention :
 * elle est en revanche la bonne lecture pour les comptes antérieurs au
 * sélecteur, dont tous les numéros sont du pays par défaut.
 *
 * Renvoie `null` seulement pour un numéro sans aucun chiffre, qu'aucun pays ne
 * peut revendiquer.
 */
export function countryCodeOfPhone(phone: string): string | null {
  if (!phone) return null;

  const { country } = splitInternationalNumber(phone);

  return country?.code ?? null;
}

/**
 * Pays qu'un client déclare, s'il en envoie un que la plateforme connaît.
 *
 * Le code est mis en majuscules et comparé à la liste des plans : un client
 * peut envoyer « ci » comme « CI », et un code absent des données ne doit pas
 * être enregistré tel quel, sous peine de fabriquer une ligne de tableau de
 * bord sans drapeau ni nom.
 */
export function declaredCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const code = value.trim().toUpperCase();

  return KNOWN_CODES.has(code) ? code : null;
}

/**
 * Pays à enregistrer pour un compte : celui que le client a déclaré s'il est
 * connu, sinon celui que porte son numéro.
 */
export function resolveCountryCode(
  declared: unknown,
  phone: string
): string | null {
  return declaredCountryCode(declared) ?? countryCodeOfPhone(phone);
}

/**
 * Compte une connexion réussie et complète le pays du compte au passage.
 *
 * Appelée par les deux chemins d'authentification — l'API mobile et le
 * back-office NextAuth — pour qu'un technicien qui travaille depuis l'application
 * et un administrateur qui travaille depuis le web comptent tous deux dans la
 * mesure.
 *
 * Le pays n'est écrit que s'il manque. Il ne doit jamais être réécrit à chaque
 * connexion : un compte qui voyage garde son pays d'inscription, et l'indicatif
 * d'un numéro ne dit que l'indicatif utilisé pour le joindre, pas d'où il
 * utilise l'application.
 *
 * L'appel n'est jamais bloquant. Une écriture d'activité qui échoue doit
 * coûter une ligne de journal, pas une connexion refusée à quelqu'un dont le
 * mot de passe est le bon.
 */
export async function recordUserLogin(
  userId: string,
  phone: string
): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        loginCount: { increment: 1 },
        lastLoginAt: new Date(),
        ...(await missingCountry(userId, phone)),
      },
    });
  } catch (error) {
    console.error("User login tracking error:", error);
  }
}

/**
 * `{ country }` si le compte n'en a pas encore, `{}` sinon.
 *
 * La lecture évite l'écriture quand il n'y a rien à corriger : sans elle,
 * chaque connexion toucherait la ligne du compte, et un pays déjà connu serait
 * réécrit à chaque fois pour la même valeur.
 */
async function missingCountry(
  userId: string,
  phone: string
): Promise<{ country: string } | Record<string, never>> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { country: true },
  });

  if (existing?.country) return {};

  const country = countryCodeOfPhone(phone);

  return country ? { country } : {};
}
