/**
 * Observabilité des appels à un modèle de langage.
 *
 * Le back-office n'appelle aujourd'hui aucun LLM : ce module n'est donc appelé
 * par personne. Il existe pour que le jour où une fonction — triage d'un
 * ticket, résumé d'un rapport d'intervention, réponse au propriétaire — appellera
 * un modèle, la trace soit déjà routable et non reconstruite après coup.
 *
 * Ce que PostHog appelle « AI Observability » attend un événement
 * `$ai_generation` par appel, avec `$ai_trace_id` pour regrouper les étapes
 * d'une même opération. C'est ce que produit ce module, à partir du client
 * serveur déjà en place : pas de SDK OpenTelemetry à installer, et surtout pas
 * de 35 Mo de dépendances à charger à chaque démarrage de serveur pour un
 * appel qui n'existe pas encore.
 *
 * Si l'introduction du LLM passe par un SDK déjà instrumenté (Vercel AI SDK,
 * SDK OpenAI, SDK Anthropic), `npx @posthog/wizard ai-observability` remplace ce
 * fichier par l'instrumentation du SDK. Il ne faut pas garder les deux : les
 * même appels seraient comptés deux fois.
 */

import { captureServerEvent } from './posthog-server';

/** Un message transmis au modèle ou renvoyé par lui. */
export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** Ce qu'un appel au modèle a coûté et produit. */
export type LlmCall = {
  /** Modle appelé, tel que le fournisseur le nomme (`gpt-5-mini`, `claude-…`). */
  model: string;
  /** Fournisseur : `openai`, `anthropic`, `gemini`… */
  provider: string;
  /** Messages envoyés. */
  input: LlmMessage[];
  /** Réponse obtenue. */
  output: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Durée de l'appel, en secondes. */
  latencySeconds: number;
  /** Identifiant du modèle chez le fournisseur, pour retrouver l'appel chez lui. */
  requestUrl?: string;
  httpStatus?: number;
  /** Raison de l'arrêt : `end_turn`, `max_tokens`, `tool_use`… */
  stopReason?: string;
};

/**
 * Exécute un appel au modèle en mesurant sa durée, et le rapporte à PostHog.
 *
 * L'appel est enveloppé plutôt que décrit après coup : c'est le seul moyen
 * d'obtenir une latence fiable et de ne pas oublier de reporter un appel qui
 * échoue — un appel en erreur est précisément celui qu'on veut voir.
 *
 * L'erreur remonte à l'appelant : l'observabilité ne transforme pas une panne
 * en succès silencieux. Elle est seulement reportée avant de bubbling.
 *
 * ```ts
 * const answer = await traceLlmCall({
 *   traceId: crypto.randomUUID(),
 *   distinctId: session.user.id,
 *   operation: 'ticket_triage',
 *   call: () => askTheModel(prompt),
 * });
 * ```
 */
export async function traceLlmCall<T>({
  traceId,
  sessionId,
  distinctId,
  operation,
  call,
}: {
  /** Regroupe les étapes d'une même opération. À générer par appel. */
  traceId: string;
  /**
   * Regroupe plusieurs traces d'une même conversation. Optionnel : une
   * opération qui tient dans une seule trace n'en a pas besoin.
   */
  sessionId?: string;
  /** Compte à l'origine de l'appel, pour le rattacher à une personne. */
  distinctId: string;
  /** Nom de l'opération, affiché dans PostHog comme nom de trace. */
  operation: string;
  call: () => Promise<{ result: T; details: Omit<LlmCall, 'latencySeconds'> }>;
}): Promise<T> {
  const startedAt = performance.now();
  const latency = () => (performance.now() - startedAt) / 1000;

  try {
    const { result, details } = await call();

    await captureServerEvent(distinctId, '$ai_generation', {
      $ai_trace_id: traceId,
      // `null` et non absent : PostHog distingue ainsi « cette opération n'a
      // pas de session » de « l'instrumentation a oublié le champ ».
      $ai_session_id: sessionId ?? null,
      $ai_span_name: operation,
      $ai_input: details.input,
      $ai_output_choices: [
        { role: 'assistant', content: details.output },
      ],
      $ai_input_tokens: details.inputTokens,
      $ai_output_tokens: details.outputTokens,
      $ai_model: details.model,
      $ai_provider: details.provider,
      $ai_latency: latency(),
      $ai_request_url: details.requestUrl,
      $ai_http_status: details.httpStatus,
      $ai_stop_reason: details.stopReason,
      $ai_is_error: false,
    });

    return result;
  } catch (error) {
    await captureServerEvent(distinctId, '$ai_generation', {
      $ai_trace_id: traceId,
      $ai_session_id: sessionId ?? null,
      $ai_span_name: operation,
      $ai_latency: latency(),
      $ai_is_error: true,
      $ai_error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}