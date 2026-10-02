/**
 * Capture des erreurs serveur.
 *
 * Next.js appelle `onRequestError` pour chaque erreur qu'il attrape : rendu d'un
 * Server Component, route handler, Server Action, proxy. C'est le seul endroit où
 * Next.js expose ces erreurs de façon uniforme, sans instrumenter chaque route
 * à la main.
 *
 * Le filtre `NEXT_RUNTIME` n'est pas décoratif. `instrumentation.ts` est
 * compilé pour les deux runtimes : le module `posthog-node` n'a de sens que
 * sous Node.js, et l'importer sous Edge échouerait au chargement du module.
 */
import type { Instrumentation } from 'next';

import {
  captureServerException,
  distinctIdFromCookie,
} from './lib/posthog-server';

export async function register(): Promise<void> {
  // L'initialisation de PostHog est paresseuse (voir lib/posthog-server) :
  // rien n'est à faire ici tant qu'aucune erreur n'a été capturée.
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // L'erreur n'est pas forcément celle qui a été levée : React peut l'avoir
  // remplacée par une erreur de rendu qui n'en porte que l'empreinte `digest`.
  // Cette empreinte est alors le seul moyen de la rattacher à son origine.
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : undefined;

  await captureServerException(error, distinctIdFromCookie(request.headers.cookie), {
    route_path: request.path,
    method: request.method,
    router_kind: context.routerKind,
    route_type: context.routeType,
    route_path_template: context.routePath,
    render_source: context.renderSource,
    digest,
  });
};