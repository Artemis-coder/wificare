package com.wificare.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

/**
 * Service de premier plan qui partage la position du technicien pendant son
 * déplacement.
 *
 * **Pourquoi le service envoie lui-même les points à l'API** : le cas d'usage
 * est « téléphone en poche, application en arrière-plan ». Dans cette situation
 * l'isolate Flutter est mis en pause, son flux d'événements n'est plus écouté,
 * et Android peut même tuer le processus. Un suivi porté par Dart s'arrêterait
 * donc précisément quand il est utile. Le service reçoit le jeton du technicien
 * au démarrage et poste chaque point lui-même ; Dart ne fait que lire l'état
 * pour l'afficher.
 *
 * **Pourquoi `HttpURLConnection` plutôt qu'une bibliothèque HTTP** : cela évite
 * d'ajouter OkHttp et son intercepteur à un projet qui n'en a pas besoin, et le
 * volume est d'un point toutes les quinze secondes.
 *
 * **Pourquoi le suivi n'est pas interrompu au premier échec** : le technicien
 * roule, le réseau se coupe dans un tunnel, l'API peut refuser un point. Le
 * service consigne l'incident et continue ; le point suivant rattrape l'écart,
 * alors qu'un arrêt du suivi laisserait définitivement le client sans ETA.
 */
class LocationTrackingService : Service() {

    companion object {
        private const val TAG = "WiFiCareTracking"

        const val ACTION_STOP = "com.wificare.mobile.STOP_TRACKING"

        /** Canal de notification propre au suivi, distinct des notifications in-app. */
        private const val CHANNEL_ID = "wificare_tracking"
        private const val NOTIFICATION_ID = 4711

        /** Titre de la notification, toujours identique : c'est l'état qui change. */
        private const val TITLE = "Intervention en cours"

        private const val INTERVAL_MS = 15_000L
        private const val FASTEST_INTERVAL_MS = 5_000L

        /**
         * En dessous de dix mètres, la position ne change pas assez pour faire
         * bouger une ETA, et chaque point coûte une requête et une
         * notification poussée au client.
         */
        private const val MIN_DISTANCE_M = 10f

        private const val TIMEOUT_MS = 10_000

        /** Instance vivante du service, dans le processus de l'application. */
        @Volatile
        private var instance: LocationTrackingService? = null

        /**
         * Arrête le suivi s'il tourne, et ferme la session dans tous les cas.
         *
         * Appel direct plutôt qu'un `startService` : le processus est le même,
         * et démarrer un service déjà en cours est un cas fragile sur Android 12
         * et suivants, qui refuse de laisser un service démarrer depuis
         * l'arrière-plan.
         */
        fun requestStop(context: Context) {
            val alive = instance
            if (alive != null) {
                alive.stopTracking()
            } else {
                TrackingSession.end(context.applicationContext)
            }
        }
    }

    private val client: FusedLocationProviderClient by lazy {
        LocationServices.getFusedLocationProviderClient(this)
    }

    /** Les envois sont sérialisés : ils portent tous le même jeton. */
    private val worker = Executors.newSingleThreadExecutor()

    /** Empêche les points de s'empiler si le réseau est lent ou coupé. */
    private val posting = AtomicBoolean(false)

    private var callback: LocationCallback? = null

    /** Arrêt demandé explicitement : le système ne doit pas nous redémarrer. */
    private var stopRequested = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            requestStop(this)
            return START_NOT_STICKY
        }

        // `startForeground` doit être appelé dans les cinq secondes qui suivent
        // `startForegroundService`, sinon Android tue le service. Il est donc
        // appelé avant toute vérification, et l'exception est rattrapée :
        // Android 14 refuse l'ouverture si le type de service ou l'autorisation
        // de localisation en arrière-plan manquent, et ce refus doit rester
        // lisible depuis Dart au lieu de faire tomber le processus.
        try {
            promoteToForeground()
        } catch (error: Exception) {
            Log.w(TAG, "Ouverture du service de suivi refusée par Android", error)
            abort(LocationPermissions.BACKGROUND_DENIED, startId)
            return START_NOT_STICKY
        }

        val session = TrackingSession.session(this)
        if (session == null) {
            abort(LocationPermissions.MISSING_SESSION, startId)
            return START_NOT_STICKY
        }

        if (!LocationPermissions.hasLocation(this) ||
            !LocationPermissions.hasBackgroundLocation(this)
        ) {
            val message = if (LocationPermissions.hasLocation(this)) {
                LocationPermissions.BACKGROUND_DENIED
            } else {
                LocationPermissions.LOCATION_DENIED
            }
            abort(message, startId)
            return START_NOT_STICKY
        }

        TrackingSession.running = true
        startUpdates()

        // `START_STICKY` : si le système tue le processus en cours de trajet,
        // le service redémarre seul avec la session persistée. Sans cela le
        // suivi serait silencieusement oublié au milieu du déplacement.
        return START_STICKY
    }

    override fun onDestroy() {
        detachUpdates()
        worker.shutdownNow()

        // Une destruction subie (processus tué) ne doit pas effacer la session :
        // `START_STICKY` doit pouvoir reprendre le suivi sans que Dart vive.
        if (stopRequested) {
            TrackingSession.end(this)
        } else {
            TrackingSession.running = false
        }

        super.onDestroy()
    }

    // -----------------------------------------------------------------------
    // Localisation
    // -----------------------------------------------------------------------

    private fun startUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
            .setMinUpdateDistanceMeters(MIN_DISTANCE_M)
            .setWaitForAccurateLocation(false)
            .build()

        val listener = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (location in result.locations) {
                    publish(location)
                }
            }
        }

        callback = listener
        instance = this

        // Un démarrage répété créerait deux écouteurs et doublerait les envois :
        // on détache toujours avant de rattacher.
        runCatching { client.removeLocationUpdates(listener) }

        client.requestLocationUpdates(request, listener, mainLooper)
            .addOnFailureListener { error ->
                Log.w(TAG, "Suivi de position indisponible", error)
                TrackingSession.recordError(LocationPermissions.LOCATION_DENIED)
            }

        // Dernière position connue : elle annonce le départ sans attendre le
        // premier point du GPS, qui peut prendre une trentaine de secondes.
        client.lastLocation
            .addOnSuccessListener { location ->
                if (location != null && callback != null) publish(location)
            }
    }

    private fun detachUpdates() {
        val listener = callback ?: return
        callback = null
        runCatching { client.removeLocationUpdates(listener) }
        instance = null
    }

    // -----------------------------------------------------------------------
    // Envoi des points
    // -----------------------------------------------------------------------

    private fun publish(location: Location) {
        val session = TrackingSession.session(this)
        if (session == null) {
            Log.w(TAG, "Point de position sans session : il est ignoré")
            return
        }

        if (!posting.compareAndSet(false, true)) {
            // Un envoi est déjà en cours : le point suivant portera une
            // position plus récente, inutile d'empiler celui-ci.
            return
        }

        worker.execute {
            try {
                send(session, location)
            } catch (error: Exception) {
                Log.w(TAG, "Envoi du point de position impossible", error)
                TrackingSession.recordError(
                    "Position non transmise : la connexion réseau est indisponible."
                )
            } finally {
                posting.set(false)
            }
        }
    }

    /**
     * Poste un point, en rafraîchissant le jeton si le serveur l'a rejeté.
     *
     * Le jeton d'accès a une durée de vie courte alors qu'un trajet peut durer
     * plus longtemps : sans ce second essai, le suivi s'éteindrait de lui-même
     * en cours de route.
     */
    private fun send(session: TrackingSession.Auth, location: Location) {
        val payload = JSONObject()
            .put("latitude", location.latitude)
            .put("longitude", location.longitude)
            .put("accuracy", location.accuracy.toDouble())
            .put("speed", location.speed.toDouble())
            .put("heading", location.bearing.toDouble())
            .toString()

        val url = "${session.baseUrl}/tickets/${session.ticketId}/tracking"
        var response = request(url, "POST", payload, session.accessToken)

        if (response.code == HttpURLConnection.HTTP_UNAUTHORIZED) {
            val refreshed = refresh(session)
            if (refreshed != null) {
                response = request(url, "POST", payload, refreshed.accessToken)
            }
        }

        if (response.code !in 200..299) {
            TrackingSession.recordError(
                "Position refusée par le serveur (code ${response.code})."
            )
            return
        }

        val data = runCatching { JSONObject(response.body).optJSONObject("data") }.getOrNull()
        val distance = data?.number("distanceMeters")
        val eta = data?.number("etaMinutes")?.toInt()

        TrackingSession.recordSent(distance, eta)
        updateNotification(distance, eta)
    }

    /** Échange le jeton de rafraîchissement contre un nouveau jeton d'accès. */
    private fun refresh(session: TrackingSession.Auth): TrackingSession.Auth? {
        if (session.refreshToken.isEmpty()) return null

        val response = request(
            url = "${session.baseUrl}/auth/refresh",
            method = "POST",
            body = JSONObject().put("refreshToken", session.refreshToken).toString(),
            token = null,
        )

        if (response.code !in 200..299) return null

        val data = runCatching { JSONObject(response.body).optJSONObject("data") }.getOrNull()
        val access = data?.optString("accessToken")?.takeIf { it.isNotEmpty() } ?: return null
        val refresh = data.optString("refreshToken").takeIf { it.isNotEmpty() }
            ?: session.refreshToken

        TrackingSession.saveTokens(this, access, refresh)

        return session.copy(accessToken = access, refreshToken = refresh)
    }

    /** Un point HTTP et sa réponse, sans exception : le réseau est faillible. */
    private data class Response(val code: Int, val body: String)

    private fun request(url: String, method: String, body: String?, token: String?): Response {
        val connection = URL(url).openConnection() as HttpURLConnection

        return try {
            connection.requestMethod = method
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.setRequestProperty("Accept", "application/json")

            if (token != null) {
                connection.setRequestProperty("Authorization", "Bearer $token")
            }

            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }

            val code = connection.responseCode
            val stream: InputStream? =
                if (code in 200..299) connection.inputStream else connection.errorStream

            Response(code, stream?.bufferedReader()?.use { reader -> reader.readText() } ?: "")
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONObject.number(key: String): Double? {
        if (!has(key) || isNull(key)) return null
        val value = optDouble(key, Double.NaN)
        return if (value.isNaN()) null else value
    }

    // -----------------------------------------------------------------------
    // Notification de premier plan
    // -----------------------------------------------------------------------

    /**
     * Canal en importance basse.
     *
     * Un point toutes les quinze secondes ne doit pas faire sonner le téléphone
     * du technicien : la notification ne sert qu'à rendre le service de premier
     * plan visible et légitime.
     */
    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Suivi d'intervention",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Indique que l'application partage la position pendant un déplacement."
            setShowBadge(false)
        }

        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    private fun promoteToForeground() {
        val notification = buildNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(distanceMeters: Double?, etaMinutes: Int?) {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        runCatching { manager.notify(NOTIFICATION_ID, buildNotification(distanceMeters, etaMinutes)) }
    }

    private fun buildNotification(
        distanceMeters: Double? = TrackingSession.distanceMeters,
        etaMinutes: Int? = TrackingSession.etaMinutes,
    ): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(TITLE)
            .setContentText(textOf(distanceMeters, etaMinutes))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(openAppIntent())
            .setWhen(TrackingSession.startedAt)
            .setUsesChronometer(true)
            .build()
    }

    /**
     * Texte de la notification.
     *
     * La distance et l'ETA viennent du serveur : le technicien voit ainsi la
     * même information que le client, sans ouvrir l'application en conduisant.
     */
    private fun textOf(distanceMeters: Double?, etaMinutes: Int?): String {
        val distance = distanceMeters?.let { meters ->
            if (meters < 1000) {
                String.format(Locale.FRANCE, "%d m", meters.toInt())
            } else {
                String.format(Locale.FRANCE, "%.1f km", meters / 1000)
            }
        }
        val eta = etaMinutes?.let { "$it min" }

        return when {
            distance != null && eta != null -> "Client à $distance · arrivée dans $eta"
            distance != null -> "Client à $distance"
            eta != null -> "Arrivée dans $eta"
            else -> "Position partagée toutes les 15 secondes"
        }
    }

    /** Taper sur la notification ramène le technicien dans son espace. */
    private fun openAppIntent(): PendingIntent {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

        return PendingIntent.getActivity(
            this,
            0,
            launch ?: Intent(Intent.ACTION_MAIN),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    // -----------------------------------------------------------------------
    // Arrêt et échec d'ouverture
    // -----------------------------------------------------------------------

    /**
     * Ferme le service en laissant un motif lisible.
     *
     * Le motif est conservé dans l'état au lieu d'être perdu : l'écran technicien
     * le lit au retour et peut expliquer au technicien pourquoi le client ne
     * voit pas son ETA.
     */
    private fun abort(message: String, startId: Int) {
        stopRequested = true
        TrackingSession.running = false
        TrackingSession.lastError = message
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf(startId)
    }

    private fun stopTracking() {
        stopRequested = true

        val session = TrackingSession.session(this)
        if (session != null) {
            // Filet de sécurité : Dart appelle déjà l'arrêt sur l'API, mais si
            // l'application a été tuée entre-temps, le client doit tout de même
            // voir le suivi se terminer.
            worker.execute {
                runCatching {
                    request(
                        url = "${session.baseUrl}/tickets/${session.ticketId}/tracking/stop",
                        method = "POST",
                        body = "{}",
                        token = session.accessToken,
                    )
                }
            }
        }

        detachUpdates()
        TrackingSession.end(this)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
}
