import 'package:geolocator/geolocator.dart';

import '../push/push_service.dart';

/// Demande, et re-demande, des autorisations Android.
///
/// Deux autorisations portent l'application : les **notifications**, pour être
/// prévenu même application fermée, et la **géolocalisation**, pour partager sa
/// position et suivre celle du technicien.
///
/// Android ne ferme la boîte de dialogue définitivement qu'au **second** refus :
/// un premier refus laisse `denied`, et l'appel suivant rouvre la fenêtre. Ce
/// qui ne revient plus est `deniedForever` — le seul recours est alors les
/// réglages du téléphone. D'où [LocationGrant] : il distingue « on peut encore
/// demander » de « il faut passer par les réglages », pour ne pas offrir un
/// bouton qui ne mènera nulle part.
class PermissionsService {
  const PermissionsService._();

  /// Demande les notifications, si elles ne sont pas déjà accordées.
  ///
  /// Ne redemande pas si l'utilisateur a déjà tranché : sur Android 13+, un
  /// second appel ne fait rien et l'écran donnerait l'illusion d'une seconde
  /// chance.
  static Future<NotificationGrant> requestNotifications({
    required PushService push,
  }) async {
    if (!push.isAvailable) {
      return const NotificationGrant(unavailable: true);
    }

    try {
      final settings = await push.requestPermission();

      return NotificationGrant(
        granted: settings,
        // Un refus n'est pas un blocage définitif côté serveur : le
        // technicien reste atteignable par la notification in-app.
        canAskAgain: true,
      );
    } catch (_) {
      return const NotificationGrant(unavailable: true);
    }
  }

  /// Demande la localisation au premier plan.
  static Future<LocationGrant> requestLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationGrant(servicesDisabled: true);
      }

      var permission = await Geolocator.checkPermission();

      // Déjà accordée : ne pas solliciter l'utilisateur une seconde fois.
      if (permission == LocationPermission.whileInUse ||
          permission == LocationPermission.always) {
        return const LocationGrant(granted: true);
      }

      if (permission == LocationPermission.deniedForever) {
        return const LocationGrant(deniedForever: true);
      }

      permission = await Geolocator.requestPermission();

      if (permission == LocationPermission.whileInUse ||
          permission == LocationPermission.always) {
        return const LocationGrant(granted: true);
      }

      // `deniedForever` peut être le résultat de l'appel juste fait : Android
      // accorde un nombre limité de tentatives.
      if (permission == LocationPermission.deniedForever) {
        return const LocationGrant(deniedForever: true);
      }

      return const LocationGrant(granted: false);
    } catch (_) {
      return const LocationGrant(unavailable: true);
    }
  }

  /// Ouvre les réglages de l'application.
  ///
  /// Seul recours quand Android a fermé la boîte de dialogue pour de bon. Sans
  /// ce chemin, l'utilisateur qui a refusé deux fois n'a plus aucune way de
  /// revenir en arrière depuis l'application.
  static Future<bool> openSettings() async {
    try {
      return await Geolocator.openAppSettings();
    } catch (_) {
      return false;
    }
  }
}

/// Issue de la demande de géolocalisation.
class LocationGrant {
  const LocationGrant({
    this.granted = false,
    this.deniedForever = false,
    this.servicesDisabled = false,
    this.unavailable = false,
  });

  final bool granted;

  /// Refus définitif : Android n'affichera plus de dialogue, il faut les
  /// réglages du téléphone.
  final bool deniedForever;

  /// Localisation éteinte dans les réglages du téléphone. Distincte d'un refus
  /// d'autorisation : l'utilisateur l'a désactivée au niveau système, et c'est
  /// lui qui doit la rallumer.
  final bool servicesDisabled;

  /// Le téléphone n'a pas su répondre, ou la plateforme n'a pas répondu.
  final bool unavailable;

  bool get isGranted => granted;

  /// Une nouvelle boîte de dialogue peut-elle encore apparaître ?
  ///
  /// Faux seulement si Android l'a fermée pour de bon. C'est ce qui décide entre
  /// « Autoriser » et « Ouvrir les réglages ».
  bool get canAskAgain => !deniedForever;

  /// Message prêt à afficher, expliquant la suite et le geste à faire.
  String get message => switch (this) {
      LocationGrant(granted: true) => 'Position autorisée.',
      LocationGrant(servicesDisabled: true) =>
        'La localisation est éteinte sur ce téléphone. Activez-la pour partager '
            'votre position et suivre l\'arrivée du technicien.',
      LocationGrant(deniedForever: true) =>
        'Position refusée définitivement. Ouvrez les réglages de WiFiCare pour '
            'l\'autoriser, sinon le client ne verra pas votre arrivée estimée.',
      _ => 'Position non autorisée. Vous pouvez continuer sans le suivi.',
    };
}

/// Issue de la demande de notification.
class NotificationGrant {
  const NotificationGrant({
    this.granted = false,
    this.canAskAgain = true,
    this.unavailable = false,
  });

  final bool granted;
  final bool canAskAgain;
  final bool unavailable;
}
