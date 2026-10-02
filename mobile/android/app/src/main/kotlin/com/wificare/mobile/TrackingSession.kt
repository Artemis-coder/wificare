package com.wificare.mobile

import android.content.Context
import java.util.concurrent.CopyOnWriteArrayList

/**
 * État du suivi de position d'une intervention, partagé entre le service de
 * premier plan et le canal Dart.
 *
 * **Pourquoi un état global plutôt qu'un canal Dart comme source de vérité** :
 * le technicien conduit, son téléphone est en poche et l'isolate Flutter est
 * mis en pause par Android. Le service doit donc pouvoir travailler seul, et le
 * canal ne sert qu'à *lire* ce que le service a réellement fait. L'état est tenu
 * ici, en mémoire, avec une copie dans les préférences privées de
 * l'application : elle permet à `status()` de rester exact après une mort du
 * processus, et au service redémarré par le système (`START_STICKY`) de reprendre
 * le suivi sans que Dart soit vivant.
 */
object TrackingSession {

    private const val PREFS = "wificare_tracking"

    private const val KEY_TICKET_ID = "ticketId"
    private const val KEY_BASE_URL = "baseUrl"
    private const val KEY_ACCESS_TOKEN = "accessToken"
    private const val KEY_REFRESH_TOKEN = "refreshToken"
    private const val KEY_STARTED_AT = "startedAt"

    /** Écouteurs Dart abonnés au flux d'événements du canal. */
    private val listeners = CopyOnWriteArrayList<(Map<String, Any?>) -> Unit>()

    /** Demande suivie, `null` si aucun suivi n'est ouvert. */
    @Volatile
    var ticketId: String? = null

    /** Instant de démarrage du suivi, 0 si aucun suivi n'est ouvert. */
    @Volatile
    var startedAt: Long = 0L

    /** Le service tourne-t-il réellement en ce moment. */
    @Volatile
    var running: Boolean = false

    /** Dernier point accepté par le serveur, 0 si aucun. */
    @Volatile
    var lastSentAt: Long = 0L

    /** Distance restante connue du serveur, en mètres. */
    @Volatile
    var distanceMeters: Double? = null

    /** Arrivée estimée par le serveur, en minutes. */
    @Volatile
    var etaMinutes: Int? = null

    /** Dernier incident rencontré, à afficher tel quel à Dart. */
    @Volatile
    var lastError: String? = null

    /**
     * Jeton d'accès du technicien pour la demande suivie.
     *
     * Le service envoie lui-même chaque point à l'API : il a donc besoin de ces
     * quatre valeurs en permanence. `copy` permet de rejouer un point avec un
     * jeton rafraîchi sans muter l'état global.
     */
    data class Auth(
        val ticketId: String,
        val baseUrl: String,
        val accessToken: String,
        val refreshToken: String,
    )

    /**
     * Ouvre (ou remplace) une session de suivi et en conserve les identifiants.
     *
     * Les jetons sont conservés parce que le service les envoie lui-même à
     * l'API : il doit pouvoir continuer sans repasser par Dart. Ils sont effacés
     * à l'arrêt du suivi, pas avant.
     */
    fun begin(
        context: Context,
        ticketId: String,
        baseUrl: String,
        accessToken: String,
        refreshToken: String,
    ) {
        this.ticketId = ticketId
        this.startedAt = System.currentTimeMillis()
        this.running = true
        this.lastSentAt = 0L
        this.distanceMeters = null
        this.etaMinutes = null
        this.lastError = null

        prefs(context).edit()
            .putString(KEY_TICKET_ID, ticketId)
            .putString(KEY_BASE_URL, baseUrl)
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_STARTED_AT, startedAt)
            .apply()
    }

    /** Session persistée, relue après un redémarrage du processus. */
    fun session(context: Context): Auth? {
        val stored = prefs(context)
        val ticket = stored.getString(KEY_TICKET_ID, null)
        val baseUrl = stored.getString(KEY_BASE_URL, null)
        val access = stored.getString(KEY_ACCESS_TOKEN, null)
        val refresh = stored.getString(KEY_REFRESH_TOKEN, null)

        if (ticket.isNullOrEmpty() || baseUrl.isNullOrEmpty() || access.isNullOrEmpty()) {
            return null
        }

        // La mémoire vive peut encore décrire la session précédente : la
        // ligne persistée est alors la référence, et son `startedAt` doit
        // redevenir lisible pour le chronomètre de la notification.
        if (this.ticketId != ticket) {
            startedAt = stored.getLong(KEY_STARTED_AT, 0L)
        }

        return Auth(
            ticketId = ticket,
            baseUrl = baseUrl,
            accessToken = access,
            refreshToken = refresh.orEmpty(),
        )
    }

    /**
     * Remplace les jetons après un rafraîchissement.
     *
     * Le jeton d'accès a une durée de vie courte alors qu'un trajet peut durer
     * plus longtemps : sans cette persistance, le suivi mourrait en cours de
     * route et le client verrait son compte à rebours figé.
     */
    fun saveTokens(context: Context, accessToken: String, refreshToken: String) {
        prefs(context).edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .apply()
    }

    /** Enregistre un point accepté par le serveur et notifie Dart. */
    fun recordSent(distanceMeters: Double?, etaMinutes: Int?) {
        lastSentAt = System.currentTimeMillis()
        this.distanceMeters = distanceMeters
        this.etaMinutes = etaMinutes
        lastError = null
        emit(
            mapOf(
                "type" to "position",
                "ticketId" to ticketId,
                "sentAt" to lastSentAt,
                "distanceMeters" to distanceMeters,
                "etaMinutes" to etaMinutes,
            ),
        )
    }

    /**
     * Consigne un incident sans arrêter le service.
     *
     * Un point sauté n'est jamais une raison de laisser le technicien sans
     * suivi : il roule, la connexion peut couper plusieurs fois, et le point
     * suivant répare l'écart.
     */
    fun recordError(message: String) {
        lastError = message
        emit(
            mapOf(
                "type" to "error",
                "ticketId" to ticketId,
                "message" to message,
            ),
        )
    }

    /** Ferme la session et efface les identifiants conservés. */
    fun end(context: Context) {
        running = false
        ticketId = null
        startedAt = 0L
        lastSentAt = 0L
        distanceMeters = null
        etaMinutes = null
        lastError = null
        prefs(context).edit().clear().apply()
    }

    /** Photographie de l'état, renvoyée par `status()` et à l'abonnement du flux. */
    fun snapshot(): Map<String, Any?> = mapOf(
        "running" to running,
        "ticketId" to ticketId,
        "startedAt" to (if (startedAt > 0) startedAt else null),
        "lastSentAt" to (if (lastSentAt > 0) lastSentAt else null),
        "distanceMeters" to distanceMeters,
        "etaMinutes" to etaMinutes,
        "error" to lastError,
    )

    fun addListener(listener: (Map<String, Any?>) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (Map<String, Any?>) -> Unit) {
        listeners.remove(listener)
    }

    private fun emit(event: Map<String, Any?>) {
        for (listener in listeners) {
            runCatching { listener(event) }
        }
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
