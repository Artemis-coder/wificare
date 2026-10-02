import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/location/location_tracking.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/permissions/permissions_service.dart';
import '../../../core/providers/infra_providers.dart';
import 'technician_providers.dart';

/// Suivi de position de la demande que le technicien est en train de rejoindre.
///
/// Alimenté par le service Android : c'est lui qui envoie réellement les points,
/// cet état ne fait que refléter ce que le service a réussi à transmettre.
class TechnicianTrackingState {
  const TechnicianTrackingState({
    this.available = true,
    this.active = false,
    this.ticketId,
    this.lastSentAt,
    this.distanceMeters,
    this.etaMinutes,
    this.message,
  });

  /// La plateforme Android répond : le suivi est possible en principe.
  final bool available;

  /// Le service de premier plan tourne.
  final bool active;

  final String? ticketId;

  /// Dernier point accepté par le serveur.
  final DateTime? lastSentAt;

  final double? distanceMeters;
  final int? etaMinutes;

  /// Message à afficher au technicien, en français, quand quelque chose s'est
  /// mal passé. `null` tant que tout va bien.
  final String? message;

  /// Au moins une position a atteint le serveur.
  bool get hasSentPosition => lastSentAt != null;

  TechnicianTrackingState copyWith({
    bool? available,
    bool? active,
    String? ticketId,
    DateTime? lastSentAt,
    double? distanceMeters,
    int? etaMinutes,
    String? message,
    bool clearMessage = false,
  }) {
    return TechnicianTrackingState(
      available: available ?? this.available,
      active: active ?? this.active,
      ticketId: ticketId ?? this.ticketId,
      lastSentAt: lastSentAt ?? this.lastSentAt,
      distanceMeters: distanceMeters ?? this.distanceMeters,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      message: clearMessage ? null : (message ?? this.message),
    );
  }
}

final technicianTrackingProvider =
    NotifierProvider<TechnicianTrackingController, TechnicianTrackingState>(
      TechnicianTrackingController.new,
    );

/// Pilote le partage de position autour des transitions de statut.
///
/// **Aucun échec n'est propagé.** L'ETA est un confort : une autorisation refusée,
/// un GPS indisponible ou un réseau en panne ne doivent jamais empêcher le
/// technicien de faire avancer sa demande. L'échec est donc consigné dans l'état
/// et rendu à l'écran sous forme de message.
class TechnicianTrackingController extends Notifier<TechnicianTrackingState> {
  @override
  TechnicianTrackingState build() {
    // Le service émet ses points : l'écran les suit sans sonder, et sans
    // drainer une information que l'isolate est seul à traiter.
    final subscription = LocationTracking.events.listen(_onEvent);
    ref.onDispose(subscription.cancel);

    return const TechnicianTrackingState();
  }

  /// Démarre le suivi au moment où le technicien passe la demande en route.
  Future<void> start(String ticketId) async {
    final storage = ref.read(tokenStorageProvider);
    final accessToken = await storage.readAccessToken();
    final refreshToken = await storage.readRefreshToken();

    if (accessToken == null || accessToken.isEmpty) {
      state = TechnicianTrackingState(
        ticketId: ticketId,
        message: 'Session expirée : le suivi de position est indisponible.',
      );
      return;
    }

    // Le technicien peut avoir refusé la localisation au premier lancement, ou
    // ne pas l'avoir accordée du tout. Comme il vient d'appuyer sur « Démarrer
    // le déplacement », le suivi est précisément ce qu'il vient de demander : on
    // repose la question, une fois, au moment où elle a du sens. Android la
    // refusera à nouveau si l'utilisateur l'a déjà refusée définitivement, et
    // dans ce cas le message ci-dessous lui dit d'ouvrir les réglages.
    final grant = await PermissionsService.requestLocation();

    if (!grant.isGranted) {
      state = TechnicianTrackingState(
        available: grant.deniedForever || !grant.servicesDisabled,
        ticketId: ticketId,
        message: grant.message,
      );
      return;
    }

    final result = await LocationTracking.start(
      ticketId: ticketId,
      baseUrl: AppConfig.apiBaseUrl,
      accessToken: accessToken,
      refreshToken: refreshToken ?? '',
    );

    if (!result.available || !result.started) {
      state = TechnicianTrackingState(
        available: result.available,
        ticketId: ticketId,
        message:
            result.message ??
            'Suivi de position indisponible : le client ne verra pas votre arrivée estimée.',
      );
      return;
    }

    state = TechnicianTrackingState(active: true, ticketId: ticketId);

    // Le point de départ est posté par Dart, à partir de la dernière position
    // connue de l'appareil : le serveur démarre le suivi et l'ETA s'affiche chez
    // le client sans attendre le premier point du GPS, qui peut prendre trente
    // secondes. La suite est portée par le service, qui n'a plus besoin de Dart.
    final fix = result.lastFix;
    if (fix == null || !fix.isValid) return;

    try {
      final point = await ref
          .read(technicianRepositoryProvider)
          .sharePosition(
            ticketId: ticketId,
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
          );

      state = state.copyWith(
        lastSentAt: point.recordedAt ?? DateTime.now(),
        distanceMeters: point.distanceMeters,
        etaMinutes: point.etaMinutes,
        clearMessage: true,
      );
    } on ApiException catch (error) {
      state = state.copyWith(message: error.message);
    } catch (_) {
      state = state.copyWith(
        message:
            'Position de départ non transmise : le suivi reste actif et partira au prochain point.',
      );
    }
  }

  /// Arrête le suivi quand le technicien quitte le déplacement.
  ///
  /// Le service Android est arrêté d'abord, puis l'API est informée. L'ordre est
  /// important : si l'application est tuée entre les deux, le service a au moins
  /// déjà cessé d'émettre, et le client verra le suivi se terminer au plus tard.
  Future<void> stop(String ticketId) async {
    await LocationTracking.stop();

    try {
      await ref.read(technicianRepositoryProvider).stopTracking(ticketId);
    } on ApiException {
      // L'arrêt a déjà été tenté par le service : le client peut encore voir un
      // suivi actif, mais il ne recevra plus de point.
    } catch (_) {
      // Réseau indisponible : même conséquence, sans interrompre la transition.
    }

    state = const TechnicianTrackingState();
  }

  void _onEvent(LocationTrackingEvent event) {
    if (!event.isPosition) return;

    state = state.copyWith(
      active: true,
      ticketId: event.ticketId,
      lastSentAt: event.sentAt,
      distanceMeters: event.distanceMeters,
      etaMinutes: event.etaMinutes,
      clearMessage: true,
    );
  }
}
