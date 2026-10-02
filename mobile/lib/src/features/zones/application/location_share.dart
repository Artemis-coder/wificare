import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../data/client_location.dart';
import 'zone_providers.dart';

/// Partage de la position du client, en cours.
///
/// Un seul état pour le bouton en cours et son message : les séparer
/// permettrait au bouton de redevenir actif pendant que l'erreur de la tentative
/// précédente est encore affichée.
class LocationShareState {
  const LocationShareState({this.busy = false, this.error, this.needsSettings = false});

  final bool busy;
  final String? error;

  /// Le seul moyen de retour est d'ouvrir les réglages du téléphone.
  ///
  /// Android rouvre la boîte de dialogue après un refus simple, mais la ferme
  /// définitivement au second. Offering alors « Réessayer » laisserait le
  /// client appuyer sur un bouton qui ne peut plus rien déclencher : l'écran
  /// doit proposer le geste qui, lui, aboutit.
  final bool needsSettings;

  LocationShareState copyWith({
    bool? busy,
    String? error,
    bool? needsSettings,
    bool clearError = false,
  }) {
    return LocationShareState(
      busy: busy ?? this.busy,
      error: clearError ? null : (error ?? this.error),
      needsSettings: needsSettings ?? this.needsSettings,
    );
  }
}

/// Suivi du partage de position du client pour une demande ouverte.
///
/// L'état disparaît avec l'écran, et un partage en cours ne laisse pas de
/// bouton actif sur une page fermée.
class LocationShareController extends Notifier<LocationShareState> {
  @override
  LocationShareState build() => const LocationShareState();

  /// Relève la position du client et l'enregistre comme destination de la zone.
  ///
  /// Renvoie `true` si la position a été enregistrée. Les deux étapes peuvent
  /// échouer séparément : ne pas voir de position est un cas normal sur un
  /// téléphone ancien ou en intérieur, et le message doit le dire au lieu de
  /// disparaître.
  Future<bool> share(String wifiZoneId) async {
    state = state.copyWith(busy: true, clearError: true);

    try {
      final result = await ClientLocation.current();

      if (!result.isGranted) {
        state = state.copyWith(
          busy: false,
          error: result.message,
          needsSettings: result.needsSettings,
        );
        return false;
      }

      await ref.read(zoneRepositoryProvider).shareLocation(
            wifiZoneId,
            latitude: result.latitude!,
            longitude: result.longitude!,
          );

      state = const LocationShareState();

      return true;
    } on ApiException catch (error) {
      state = state.copyWith(busy: false, error: error.message);
      return false;
    } catch (_) {
      state = state.copyWith(
        busy: false,
        error: 'Position non enregistrée. Réessayez.',
      );

      return false;
    }
  }
}

final locationShareProvider =
    NotifierProvider<LocationShareController, LocationShareState>(
  LocationShareController.new,
);