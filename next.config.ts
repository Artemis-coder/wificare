import { readdir, rm } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Source maps pour le suivi des erreurs.
 *
 * Un build de production minifie le JavaScript : sans source maps, la pile
 * d'erreurs dans PostHog pointe vers des lignes de `.next/static/chunks/…`
 * sans rapport avec le code écrit, et l'exception devient inexploitable. Le
 * plugin génère les cartes, les envoie à PostHog, puis les supprime du build
 * servi — un `.map` publié sur le site expose le code source à quiconque le
 * demande.
 *
 * Le plugin n'est appliqué que si la clé personnelle est présente : il refuse
 * une clé vide, et `npm run build` doit rester utilisable sur une machine où
 * elle n'est pas configurée.
 */
const personalApiKey = process.env.POSTHOG_API_KEY;

/**
 * Le plugin déclare un retour `NextConfig`, mais il renvoie en réalité une
 * fonction de configuration — c'est elle que Next appelle avec la phase de
 * build. On note l'écart ici plutôt qu'à l'appel, où il faudrait un cast.
 */
type PostHogConfigFactory = (
  phase: string,
  args: { defaultConfig: NextConfig },
) => Promise<NextConfig>;

const sourceMapConfig: PostHogConfigFactory | undefined = personalApiKey
  ? (withPostHogConfig(nextConfig, {
      personalApiKey,
      projectId: process.env.POSTHOG_PROJECT_ID,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        releaseName: "wificare-web",
        // Le commit plutôt qu'un numéro de version : une exception signalée un
        // jour donne le commit exact à aller lire, là où « version 1.4.0 »
        // oblige à retrouver quel commit elle désignait.
        releaseVersion: process.env.POSTHOG_RELEASE_VERSION,
        deleteAfterUpload: true,
      },
    }) as unknown as PostHogConfigFactory)
  : undefined;

if (!personalApiKey) {
  console.warn(
    "[posthog] POSTHOG_API_KEY absente : les source maps ne seront pas envoyees a PostHog.",
  );
}

/**
 * Supprime les cartes source que le build vient de produire.
 *
 * Le plugin les efface quand l'envoi réussit (`deleteAfterUpload`). Quand
 * l'envoi échoue, il les laisse en place — et `.next/static` est servi tel quel :
 * n'importe qui peut alors demander `/_next/static/chunks/….js.map` et
 * récupérer le code source, écrit et annoté, de tout le back-office.
 *
 * Les effacer est donc le seul choix sûr dans ce cas. On perd les piles
 * lisibles des prochaines exceptions, ce qui est le problème que cet envoi devait
 * résoudre ; on ne peut pas le laisser, lui, en créer un plus grave.
 *
 * L'arborescence est parcourue à la main plutôt que passée à `rm` avec un motif
 * récursif : `rm` accepte un motif, mais n'y interprète pas le double étoile, et
 * supprime donc silencieusement zéro fichier.
 */
async function deleteSourceMaps(distDir: string): Promise<void> {
  // `distDir` est relatif au répertoire du projet, et peut lui-même être un
  // chemin absolu.
  const root = path.isAbsolute(distDir)
    ? distDir
    : path.join(process.cwd(), distDir);

  await Promise.all(
    // Les chunks du navigateur sont à la racine de `static`, ceux du serveur un
    // niveau plus bas : un seul répertoire ne couvrirait pas les deux.
    ["static", "server"].map((directory) => removeMapsUnder(path.join(root, directory))),
  );
}

/** Supprime tous les `.map` d'un répertoire, quelle que soit sa profondeur. */
async function removeMapsUnder(directory: string): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // Le répertoire n'existe pas : il n'y a rien à supprimer, et ce n'est pas
    // une raison de faire échouer le build.
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await removeMapsUnder(target);
      } else if (entry.name.endsWith(".map")) {
        // `force` : une carte déjà supprimée entre-temps n'est pas une erreur.
        await rm(target, { force: true });
      }
    }),
  );
}

/**
 * Empêche un envoi de source maps raté de faire échouer le build.
 *
 * Le plugin branche l'envoi sur `compiler.runAfterProductionCompile`, et une
 * erreur à cet endroit interrompt tout le build. C'est le mauvais rapport de
 * force : une clé personnelle sans les scopes `error_tracking`, un quota
 * dépassé ou une coupure réseau pendant le build feraient échouer un
 * déploiement alors que l'application est parfaitement construite. Le build
 * n'a pas de raison de tomber pour cela — il perd seulement les piles lisibles
 * des prochaines exceptions.
 *
 * L'avertissement reste en sortie de build : un envoi silencieusement sauté
 * ferait croire que les source maps sont en place.
 */
export default async function config(phase: string, args: {
  defaultConfig: NextConfig;
}): Promise<NextConfig> {
  // Le plugin renvoie une fonction de config, appelée par Next avec la phase de
  // build et la configuration par défaut. C'est son résultat qu'il faut
  // envelopper, pas le plugin lui-même.
  if (!sourceMapConfig) return nextConfig;

  const resolved = await sourceMapConfig(phase, args);
  const upload = resolved.compiler?.runAfterProductionCompile;

  if (!upload) return resolved;

  return {
    ...resolved,
    compiler: {
      ...resolved.compiler,
      runAfterProductionCompile: async (compilerConfig) => {
        try {
          await upload(compilerConfig);
        } catch (error) {
          console.warn(
            "[posthog] Envoi des source maps echoue, le build continue. Les piles " +
              "d'exceptions resteront minifiees tant que POSTHOG_API_KEY n'a pas les " +
              "scopes error_tracking:read et error_tracking:write. Cause :",
            error instanceof Error ? error.message : error,
          );

          await deleteSourceMaps(compilerConfig.distDir);
        }
      },
    },
  };
}