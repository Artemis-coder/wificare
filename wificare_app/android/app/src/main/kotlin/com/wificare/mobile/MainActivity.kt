package com.wificare.mobile

import android.content.Intent
import android.os.Build
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.Result

/**
 * Activité Android, seule à porter les canaux de plateforme.
 *
 * Le suivi de position est un service (`LocationTrackingService`) : cette
 * activité ne fait que lui transmettre les ordres de Dart et lire son état.
 * Elle ne doit à aucun moment savoir encoder un point de position — c'est le
 * service qui les envoie lui-même à l'API, afin que le suivi survive à une mise
 * en arrière-plan ou à la mort de l'isolate Flutter.
 */
class MainActivity : FlutterActivity() {

    private companion object {
        const val TAG = "WiFiCareChannel"

        const val LOCATION_CHANNEL = "com.wificare.mobile/location"
        const val LOCATION_EVENTS_CHANNEL = "com.wificare.mobile/location/events"
    }

    /** Récepteur des événements du service, tant que Dart est à l'écoute. */
    private var events: EventChannel.EventSink? = null

    /** Référence stable : c'est elle que `onCancel` doit retirer. */
    private val trackerListener: (Map<String, Any?>) -> Unit = { event ->
        events?.success(event)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, LOCATION_CHANNEL).setMethodCallHandler(::onLocationCommand)

        // Flux d'état du suivi. Dart ne s'en sert que pour afficher « position
        // envoyée » : son absence ne doit jamais interrompre l'envoi des points.
        EventChannel(messenger, LOCATION_EVENTS_CHANNEL).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    this@MainActivity.events = events
                    TrackingSession.addListener(trackerListener)
                    events?.success(TrackingSession.snapshot())
                }

                override fun onCancel(arguments: Any?) {
                    TrackingSession.removeListener(trackerListener)
                    this@MainActivity.events = null
                }
            },
        )
    }

    private fun onLocationCommand(call: MethodCall, result: Result) {
        when (call.method) {
            "start" -> startTracking(call, result)
            "stop" -> {
                LocationTrackingService.requestStop(this)
                result.success(TrackingSession.snapshot())
            }
            "status" -> result.success(TrackingSession.snapshot())
            else -> result.notImplemented()
        }
    }

    /**
     * Démarre le suivi de position d'une demande.
     *
     * Les autorisations sont vérifiées ici, avant le lancement du service, et
     * leur refus est renvoyé comme une erreur lisible : Android 14 refuse
     * l'ouverture d'un service de premier plan de type localisation sans
     * autorisation en arrière-plan, et mieux vaut l'expliquer que de laisser une
     * exception remonter.
     */
    private fun startTracking(call: MethodCall, result: Result) {
        val ticketId = call.argument<String>("ticketId")
        val baseUrl = call.argument<String>("baseUrl")
        val accessToken = call.argument<String>("accessToken")
        val refreshToken = call.argument<String>("refreshToken") ?: ""

        if (ticketId.isNullOrEmpty()) {
            result.error(
                "ticket_invalide",
                "Suivi de position lancé sans identifiant de demande.",
                null,
            )
            return
        }

        if (baseUrl.isNullOrEmpty() || accessToken.isNullOrEmpty()) {
            result.error(
                "session_invalide",
                "Suivi de position impossible : la session du technicien est inconnue.",
                null,
            )
            return
        }

        if (!LocationPermissions.hasLocation(this)) {
            result.error("permission_refusee", LocationPermissions.LOCATION_DENIED, null)
            return
        }

        if (!LocationPermissions.hasBackgroundLocation(this)) {
            result.error(
                "permission_arriere_plan_refusee",
                LocationPermissions.BACKGROUND_DENIED,
                null,
            )
            return
        }

        TrackingSession.begin(
            context = this,
            ticketId = ticketId,
            baseUrl = baseUrl.trimEnd('/'),
            accessToken = accessToken,
            refreshToken = refreshToken,
        )

        val intent = Intent(this, LocationTrackingService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (error: Exception) {
            // Android refuse parfois l'ouverture (application en arrière-plan,
            // quota de services de premier plan). Le motif est renvoyé tel quel.
            Log.w(TAG, "Démarrage du service de suivi refusé", error)
            TrackingSession.end(this)
            result.error(
                "demarrage_refuse",
                "Android a refusé le démarrage du suivi de position. " +
                    "Réessayez depuis l'application.",
                error.message,
            )
            return
        }

        // La dernière position connue permet à Dart d'annoncer le départ tout
        // de suite ; son absence n'empêche pas le service de poster le premier
        // point dès qu'il l'obtient.
        val fused = com.google.android.gms.location.LocationServices
            .getFusedLocationProviderClient(this)

        fused.lastLocation
            .addOnCompleteListener { task ->
                val last = if (task.isSuccessful) task.result else null
                result.success(
                    mapOf(
                        "started" to true,
                        "ticketId" to ticketId,
                        "lastLocation" to last?.let {
                            mapOf(
                                "latitude" to it.latitude,
                                "longitude" to it.longitude,
                                "accuracy" to it.accuracy.toDouble(),
                            )
                        },
                    ),
                )
            }
    }
}
