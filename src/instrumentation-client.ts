/**
 * Initialisation de PostHog côté navigateur.
 *
 * Ce fichier s'exécute après le chargement du document et avant l'hydratation de
 * React : PostHog est donc prêt avant le premier rendu, ce qui évite qu'une
 * navigation ou une erreur survenue au démarrage échappe à l'observabilité.
 *
 * L'initialisation est volontairement tolérante aux pannes. Une erreur réseau
 * vers PostHog ne doit jamais empêcher le back-office de s'afficher : l'absence
 * de jeton — une variable absente en développement local, par exemple —
 * désactive l'envoi au lieu de lever.
 */
import posthog from 'posthog-js';

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

/**
 * Replay de session : désactivé par défaut, à activer explicitement.
 *
 * Le back-office n'affiche pas des pages de produit, il affiche des dossiers :
 * numéros de téléphone, adresses, photos d'incident, montants de facture. Un
 * replay activé par défaut enverrait ces données à un service tiers sur chaque
 * écran ouvert, et personne ne l'aurait vu arriver — c'est exactement le genre
 * de réglage que l'on découvre après coup, dans les données.
 *
 * Pour l'activer :
 *   NEXT_PUBLIC_POSTHOG_SESSION_RECORDING="true"
 *
 * Ce qu'il faut faire dans le même temps : les champs sont déjà masqués
 * (`maskAllInputs`), mais le texte des pages ne l'est pas. Masquer tout
 * `.page-content` ne laisserait qu'un replay de boutons vides — le replay d'un
 * écran qui ne dit rien. Il faut donc cibler ce qui est sensible, avec des
 * sélecteurs réels de l'application, plutôt que tout masquer ou tout filmer.
 */
const sessionRecording = process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING === 'true';

if (token) {
  try {
    posthog.init(token, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      defaults: '2026-05-30',
      // Le back-office appelle ses propres routes API sous le même nom d'hôte.
      // Ces en-têtes relient les événements, les exceptions et les futures
      // traces LLM capturées côté serveur à la même personne et à la même
      // session que les événements navigateur. Le nom d'hôte est utilisé seul :
      // un port ne ferait jamais correspondre la règle.
      tracing_headers: [
        typeof window !== 'undefined' ? window.location.hostname : 'localhost',
      ],
      // `disable_session_recording` et non un `enabled: false` dans
      // `session_recording` : c'est la clé qui coupe vraiment le replay, la
      // seconde est simplement ignorée par le SDK.
      disable_session_recording: !sessionRecording,
      session_recording: {
        maskAllInputs: true,
      },
      // Aucune personne n'est créée avant un `identify`. Un visiteur non
      // connecté reste un `distinct_id` anonyme : un profil « anonyme » réel
      // mélangerait tous les visiteurs d'un même navigateur.
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      // En développement, le SDK journalise chaque événement capturé dans la
      // console du navigateur. C'est le seul endroit où voir ce qui part
      // réellement : une intégration qui n'envoie rien ressemble exactement à une
      // intégration qui envoie tout.
      debug: process.env.NODE_ENV === 'development',
      // L'autocapture des exceptions est activée explicitement : par défaut,
      // le SDK lit la configuration distante, et un projet non configuré
      // capture les erreurs non gérées (window.onerror, onunhandledrejection)
      // sans que l'on ait le choix. Un back-office qui déballe des erreurs
      // d'initialisation ne doit pas les voir remonter à PostHog pour un
      // projet encore vide.
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
    });
  } catch {
    // Un échec d'initialisation ne doit pas empêcher l'application de démarrer.
  }
}