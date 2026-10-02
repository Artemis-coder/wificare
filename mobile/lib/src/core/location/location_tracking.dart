import 'dart:async';

import 'package:flutter/services.dart';

/// Carte issue du codec de plateforme, convertie en `Map<String, dynamic>`.
///
/// Le codec standard décode toute carte en `Map<Object?, Object?>` : sans cette
/// conversion, un paramètre typé `Map<String, dynamic>` échoue à l'exécution,
/// aussi bien sur un appareil qu'en test.
Map<String, dynamic>? _asPlatformMap(Object? value) {
  if (value is! Map) return null;

  return Map<String, dynamic>.from(value);
}

/// Canal Dart vers le service Android de suivi de position.
///
/// **Ce que le canal ne fait pas** : il n'envoie aucun point à l'API. C'est le
/// service Kotlin `LocationTrackingService` qui poste lui-même chaque position,
/// avec le jeton reçu à son démarrage. Le cas d'usage est « téléphone en poche » :
/// dans cette situation l'isolate Flutter est mis en pause et Android peut tuer
/// le processus, donc un suivi porté par Dart s'arrêterait exactement quand il
/// est utile. Le canal ne sert donc qu'à démarrer le service, l'arrêter, et lire
/// son état pour l'afficher.
///
/// **Absence de canal** : sur un appareil sans implémentation — un test widget,
/// un environnement de bureau — l'appel lève `MissingPluginException`. Ce cas
/// n'est pas une erreur : il signifie « pas de service de suivi ici », et il est
/// absorbé pour que l'application reste utilisable.
abstract final class LocationTracking {
  /// Canal de commandes (`start`, `stop`, `status`).
  static const MethodChannel channel = MethodChannel('com.wificare.mobile/location');

  /// Flux d'état du service, pour rafraîchir l'écran sans sonder.
  static const EventChannel _eventChannel = EventChannel(
    'com.wificare.mobile/location/events',
  );

  static Stream<LocationTrackingEvent>? _events;

  /// Délai maximal accordé à la couche native pour répondre.
  static const Duration _timeout = Duration(seconds: 5);

  /// Démarre le suivi d'une demande.
  ///
  /// Les jetons du technicien sont transmis au service : il en a besoin pour
  /// poster chaque point sans repasser par Dart, y compris après une mort du
  /// processus.
  static Future<LocationTrackingStart> start({
    required String ticketId,
    required String baseUrl,
    required String accessToken,
    required String refreshToken,
  }) async {
    try {
      final response = await _invoke('start', <String, dynamic>{
        'ticketId': ticketId,
        'baseUrl': baseUrl,
        'accessToken': accessToken,
        'refreshToken': refreshToken,
      });

      return LocationTrackingStart(
        started: response?['started'] == true,
        lastFix: LocationTrackingStartFix.fromJson(response?['lastLocation']),
      );
    } on MissingPluginException {
      return const LocationTrackingStart.unavailable();
    } on TimeoutException {
      return const LocationTrackingStart(
        started: false,
        message:
            'Suivi de position indisponible : le service natif n\'a pas répondu.',
      );
    } on PlatformException catch (error) {
      // Refus d'autorisation, session inconnue, démarrage bloqué par Android :
      // le motif vient de la plateforme et est déjà rédigé en français.
      return LocationTrackingStart(started: false, message: error.message);
    } catch (_) {
      return const LocationTrackingStart(
        started: false,
        message:
            'Suivi de position impossible : le service natif n\'a pas répondu.',
      );
    }
  }

  /// Arrête le suivi en cours.
  ///
  /// N'échoue jamais : un arrêt demandé alors que le service ne tourne pas est
  /// déjà l'état recherché.
  static Future<LocationTrackingStatus> stop() async {
    try {
      return LocationTrackingStatus.fromJson(await _invoke('stop'));
    } on MissingPluginException {
      return const LocationTrackingStatus.unavailable();
    } catch (_) {
      return const LocationTrackingStatus();
    }
  }

  /// État courant du service.
  static Future<LocationTrackingStatus> status() async {
    try {
      return LocationTrackingStatus.fromJson(await _invoke('status'));
    } on MissingPluginException {
      return const LocationTrackingStatus.unavailable();
    } catch (_) {
      return const LocationTrackingStatus();
    }
  }

  /// Appel de commande, réponse ramenée en `Map<String, dynamic>`.
  ///
  /// `invokeMapMethod` ne convient pas : le codec standard décode une carte en
  /// `Map<Object?, Object?>`, et la conversion typée échoue sur le type — en
  /// production comme en test.
  static Future<Map<String, dynamic>?> _invoke(
    String method, [
    Map<String, dynamic>? arguments,
  ]) async {
    // **Pourquoi un délai maximal** : un canal qui ne répond pas ne doit pas
    // immobiliser l'écran. Le partage de position est un confort, et le
    // technicien doit pouvoir faire avancer sa demande même si la couche
    // native ne répond plus. Sur un appareil réel l'appel répond en quelques
    // dizaines de millisecondes : le délai n'est qu'un filet.
    final response = await channel
        .invokeMethod<dynamic>(method, arguments)
        .timeout(_timeout);

    if (response is! Map) return null;

    return Map<String, dynamic>.from(response);
  }

  /// Positions annoncées par le service.
  ///
  /// Purement informatif : si le flux est absent (pas d'implémentation
  /// Android, aucun écouteur encore), il reste silencieux au lieu de faire
  /// échouer la mise en route.
  static Stream<LocationTrackingEvent> get events =>
      _events ??= _eventChannel
          .receiveBroadcastStream()
          .map(LocationTrackingEvent.fromJson)
          .handleError((Object _) {})
          .asBroadcastStream();
}

/// Résultat d'une demande de démarrage.
class LocationTrackingStart {
  const LocationTrackingStart({
    required this.started,
    this.available = true,
    this.lastFix,
    this.message,
  });

  /// Aucun service de suivi sur cet environnement.
  const LocationTrackingStart.unavailable()
    : started = false,
      available = false,
      lastFix = null,
      message = 'Suivi de position indisponible sur cet appareil.';

  /// La plateforme Android a répondu.
  final bool available;

  /// Le service de premier plan tourne.
  final bool started;

  /// Dernière position connue de l'appareil, si elle existe.
  final LocationTrackingStartFix? lastFix;

  /// Motif lisible d'un refus, en français.
  final String? message;
}

/// Position brute renvoyée par la plateforme.
class LocationTrackingStartFix {
  const LocationTrackingStartFix({
    required this.latitude,
    required this.longitude,
    this.accuracy,
  });

  /// La valeur arrive du codec de plateforme, qui décode toute carte en
  /// `Map<Object?, Object?>` : la conversion est donc faite ici plutôt que
  /// ailleurs, faute de quoi le typage échoue à l'exécution.
  factory LocationTrackingStartFix.fromJson(Object? value) {
    final json = _asPlatformMap(value);
    if (json == null) return const LocationTrackingStartFix.notAvailable();

    final latitude = json['latitude'];
    final longitude = json['longitude'];
    if (latitude is! num || longitude is! num) {
      return const LocationTrackingStartFix.notAvailable();
    }

    return LocationTrackingStartFix(
      latitude: latitude.toDouble(),
      longitude: longitude.toDouble(),
      accuracy: (json['accuracy'] as num?)?.toDouble(),
    );
  }

  /// Aucun point connu : le service enverra le sien dès qu'il l'aura.
  const LocationTrackingStartFix.notAvailable()
    : latitude = 0,
      longitude = 0,
      accuracy = null;

  final double latitude;
  final double longitude;
  final double? accuracy;

  /// Vrai quand une position exploitable a été obtenue.
  bool get isValid => latitude != 0 || longitude != 0;
}

/// État du service, tel que Dart l'affiche.
class LocationTrackingStatus {
  const LocationTrackingStatus({
    this.available = true,
    this.running = false,
    this.ticketId,
    this.startedAt,
    this.lastSentAt,
    this.distanceMeters,
    this.etaMinutes,
    this.message,
  });

  const LocationTrackingStatus.unavailable()
    : available = false,
      running = false,
      ticketId = null,
      startedAt = null,
      lastSentAt = null,
      distanceMeters = null,
      etaMinutes = null,
      message = 'Suivi de position indisponible sur cet appareil.';

  factory LocationTrackingStatus.fromJson(Object? value) {
    final json = _asPlatformMap(value);
    if (json == null) return const LocationTrackingStatus();

    return LocationTrackingStatus(
      running: json['running'] == true,
      ticketId: json['ticketId'] as String?,
      startedAt: _millis(json['startedAt']),
      lastSentAt: _millis(json['lastSentAt']),
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
      etaMinutes: (json['etaMinutes'] as num?)?.toInt(),
      message: json['error'] as String?,
    );
  }

  /// La plateforme Android répond.
  final bool available;

  /// Le service de premier plan tourne.
  final bool running;

  final String? ticketId;
  final DateTime? startedAt;
  final DateTime? lastSentAt;
  final double? distanceMeters;
  final int? etaMinutes;
  final String? message;

  static DateTime? _millis(Object? value) {
    if (value is! num) return null;
    return DateTime.fromMillisecondsSinceEpoch(value.toInt());
  }
}

/// Événement émis par le service : un point envoyé, ou un incident.
class LocationTrackingEvent {
  const LocationTrackingEvent({
    required this.type,
    this.ticketId,
    this.sentAt,
    this.distanceMeters,
    this.etaMinutes,
    this.message,
  });

  factory LocationTrackingEvent.fromJson(Object? value) {
    final json = _asPlatformMap(value);
    if (json == null) return const LocationTrackingEvent(type: 'position');

    final sentAt = json['sentAt'];

    return LocationTrackingEvent(
      type: json['type'] as String? ?? 'position',
      ticketId: json['ticketId'] as String?,
      sentAt: sentAt is num
          ? DateTime.fromMillisecondsSinceEpoch(sentAt.toInt())
          : null,
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
      etaMinutes: (json['etaMinutes'] as num?)?.toInt(),
      message: json['message'] as String?,
    );
  }

  /// `position` pour un point envoyé, `error` pour un incident.
  final String type;

  final String? ticketId;
  final DateTime? sentAt;
  final double? distanceMeters;
  final int? etaMinutes;
  final String? message;

  bool get isPosition => type == 'position';
}
