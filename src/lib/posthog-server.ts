/**
 * Client PostHog côté serveur.
 *
 * Les appels HTTP de Next.js sont courts et le processus peut s'arrêter juste
 * après la réponse : la file interne de PostHog n'aurait alors pas le temps de
 * partir. `flushAt: 1` et `flushInterval: 0` forcent l'envoi immédiat, ce qui
 * est le seul réglage qui tienne ici.
 *
 * L'instance est conservée sur `globalThis` pour que tous les modules qui
 * importent ce fichier partagent la même connexion — et le même flush — pendant
 * toute la vie du processus. En développement, Next.js recharge les modules à
 * chaque requête : une instance recréée à chaque rechargement perdrait les
 * événements envoyés entre deux rechargements.
 *
 * Le module ne lève jamais : un outil d'observabilité qui casse l'appel qu'il
 * observe est pire qu'un outil muet. Sans configuration, les fonctions exposées
 * ne font rien.
 */
import { PostHog } from 'posthog-node';

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

type ServerClient = {
  posthog: PostHog | null;
  enabled: boolean;
};

const globalForPostHog = globalThis as unknown as {
  __wificarePostHog?: ServerClient;
};

function createClient(): ServerClient {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

  if (!token) {
    return { posthog: null, enabled: false };
  }

  try {
    const posthog = new PostHog(token, {
      host: HOST,
      flushAt: 1,
      flushInterval: 0,
    });

    // Même raison que côté navigateur : en développement, le journal du serveur
    // est le seul endroit où voir ce que les server actions envoient
    // réellement. Le SDK expose ce journal comme une méthode, pas comme une
    // option de construction.
    if (process.env.NODE_ENV === 'development') posthog.debug();

    return { posthog, enabled: true };
  } catch {
    return { posthog: null, enabled: false };
  }
}

const client = globalForPostHog.__wificarePostHog ?? createClient();
globalForPostHog.__wificarePostHog = client;

/** PostHog est-il configuré sur ce déploiement ? */
export function isPostHogServerEnabled(): boolean {
  return client.enabled;
}

/**
 * Envoie un événement depuis le serveur.
 *
 * L'échec est avalé : la route qui rapporte un incident ne doit pas échouer à
 * son tour parce que PostHog est injoignable.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!client.enabled || !client.posthog) return;

  try {
    await client.posthog.captureImmediate({ distinctId, event, properties });
  } catch {
    // Observabilité indisponible : le traitement continue sans elle.
  }
}

/** Signale une exception serveur, rattachée à une personne si elle est connue. */
export async function captureServerException(
  error: unknown,
  distinctId?: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!client.enabled || !client.posthog) return;

  try {
    await client.posthog.captureExceptionImmediate(error, distinctId, properties);
  } catch {
    // Observabilité indisponible : le traitement continue sans elle.
  }
}

/**
 * Envoie un événement pour le compte connecté.
 *
 * Les server actions connaissent la session, mais `onRequestError` ne voit
 * qu'une requête : les deux chemins ont besoin de leur propre moyen de
 * rattacher un événement à une personne. Cette fonction évite de réécrire la
 * lecture de session à chaque action.
 *
 * Un événement sans session n'est pas envoyé : il serait rattaché à une
 * personne anonyme alors qu'un compte identifié l'a déclenché.
 */
export async function captureForUser(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;

  await captureServerEvent(userId, event, properties);
}

/**
 * Distinct id de la personne à l'origine d'une requête serveur.
 *
 * Le SDK navigateur dépose un cookie `ph_phc_..._posthog` qui porte le
 * `distinct_id` attribué à la personne. Le lire permet à une exception capturée
 * côté serveur d'être rattachée à la même personne que les événements
 * navigateur, et donc d'afficher le replay de session qui va avec.
 *
 * Sans cookie — appel direct à l'API, robot, requête sans navigateur — la
 * fonction rend `undefined` : PostHog rattache alors l'exception à une personne
 * anonyme, ce qui vaut mieux qu'une exception rattachée au mauvais compte.
 */
export function distinctIdFromCookie(
  cookieHeader: string | string[] | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;

  // L'en-tête `cookie` peut arriver en tableau selon le runtime.
  const cookieString = Array.isArray(cookieHeader)
    ? cookieHeader.join('; ')
    : cookieHeader;

  const match = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/);
  if (!match?.[1]) return undefined;

  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (decoded && typeof decoded === 'object' && 'distinct_id' in decoded) {
      const id = (decoded as { distinct_id: unknown }).distinct_id;
      return typeof id === 'string' ? id : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}