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

  /// Demande la localisation, y compris **en arrière-plan**.
  ///
  /// Les deux niveaux sont demandés parce que l'application en a besoin dans les
  /// deux cas, et qu'une autorisation au premier plan ne couvre que l'écran
  /// allumé : le téléphone du technicien est en poche, celui du client est posé
  /// sur une table. Android suspend alors le service de position, le client voit
  /// l'ETA figée, et personne — pas même le technicien — ne comprend pourquoi.
  ///
  /// Android traite ces deux niveaux comme **deux demandes distinctes** :
  /// les réclamer d'un bloc est ignoré, seule la première s'ouvre. Il faut donc
  /// demander le premier plan, puis revenir demander l'arrière-plan une fois
  /// le premier accordé. C'est ce second appel qui déclenche la fenêtre « Autoriser
  /// tout le temps ».
  ///
  /// Un refus de l'arrière-plan n'annule pas le premier plan : l'application
  /// reste utilisable au premier plan, et [LocationGrant.background] dit que la
  /// position ne sera pas partagée écran éteint. Ce n'est pas un échec.
  /// [requireBackground] dépose ou non la demande « tout le temps ». Elle ne
  /// vaut que là où l'application sert réellement la position écran éteint ; voir
  /// `ClientLocation.current` pour le cas où elle ne le fait pas.
  static Future<LocationGrant> requestLocation({bool requireBackground = true}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationGrant(servicesDisabled: true);
      }

      var permission = await Geolocator.checkPermission();

      if (permission == LocationPermission.always) {
        return const LocationGrant(granted: true, background: true);
      }

      if (permission == LocationPermission.deniedForever) {
        return const LocationGrant(deniedForever: true);
      }

      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      // Premier plan obtenu, ou refusé pour de bon.
      if (permission == LocationPermission.deniedForever) {
        return const LocationGrant(deniedForever: true);
      }

      if (permission != LocationPermission.whileInUse) {
        return const LocationGrant(granted: false);
      }

      if (!requireBackground) {
        return const LocationGrant(granted: true);
      }

      // Second appel, dans la foulée du premier : c'est lui qui demande
      // l'arrière-plan. `geolocator` n'ajoute `ACCESS_BACKGROUND_LOCATION` que
      // si le niveau courant est `whileInUse` — c'est-à-dire exactement ici.
      permission = await Geolocator.requestPermission();

      // Refusé : `whileInUse` est rendu tel quel, Android ne le transforme pas en
      // `denied`. L'application garde donc le premier plan, et le suit en
      // announces que la position cessera écran éteint.
      return LocationGrant(granted: true, background: permission == LocationPermission.always);
    } catch (_) {
      return const LocationGrant(unavailable: true);
    }
  }

  /// Lit l'état de l'autorisation de localisation, **sans rien demander**.
  ///
  /// Utilisé au retour des réglages du téléphone : l'utilisateur a quitté
  /// l'application pour basculer « Autoriser tout le temps », et personne ne
  /// relit l'autorisation à son retour. Le service refusait alors de démarrer
  /// indéfiniment, avec un message demandant d'aller dans les réglages — depuis
  /// l'application, sans bouton pour y aller.
  ///
  /// Aucune fenêtre n'est ouverte ici, et c'est délibéré : sur Android 11 et
  /// suivants, une demande d'arrière-plan faite depuis le dialogue ne rouvre
  /// rien ; seul un choix explicite dans les réglages l'accorde. Redemander
  /// produirait donc un dialogue vide, ou un nouveau renvoi vers les réglages,
  /// sans jamais rien accorder.
  static Future<LocationGrant> checkLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationGrant(servicesDisabled: true);
      }

      final permission = await Geolocator.checkPermission();

      return switch (permission) {
        LocationPermission.always => const LocationGrant(
          granted: true,
          background: true,
        ),
        LocationPermission.whileInUse => const LocationGrant(granted: true),
        LocationPermission.deniedForever => const LocationGrant(
          deniedForever: true,
        ),
        // `denied` ici signifie « pas encore demandé », pas « refusé » : on ne
        // le distingue pas, et c'est sans conséquence — le prochain appel de
        // demande rouvrira la fenêtre.
        _ => const LocationGrant(),
      };
    } catch (_) {
      return const LocationGrant(unavailable: true);
    }
  }

  /// Ouvre les réglages de l'application.
  ///
  /// Seul recours quand Android a fermé la boîte de dialogue pour de bon. Sans
  /// ce chemin, l'utilisateur qui a refusé deux fois n'a plus aucun moyen de
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
    this.background = false,
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

  /// L'autorisation couvre l'application en arrière-plan.
  ///
  /// Faux quand l'utilisateur n'a accordé que le premier plan : le suivi
  /// fonctionne encore, mais il s'arrêtera dès que l'écran s'éteint. Ce n'est
  /// pas un échec — Android a laissé le choix — mais cela se dit, sinon le
  /// technicien croira partager sa position pendant tout le trajet et constatera
  /// que le client ne voit plus rien.
  final bool background;

  /// Le premier plan est accordé, l'arrière-plan non.
  ///
  /// C'est le seul cas où l'application peut agir : le choix se fait dans les
  /// réglages du téléphone, et il faut y conduire le technicien jusqu'à eux —
  /// puis relire l'autorisation à son retour. Aucun dialogue ne peut régler
  /// cela depuis l'écran.
  bool get needsBackgroundSettings => granted && !background;

  bool get isGranted => granted;

  /// Une nouvelle boîte de dialogue peut-elle encore apparaître ?
  ///
  /// Faux seulement si Android l'a fermée pour de bon. C'est ce qui décide entre
  /// « Autoriser » et « Ouvrir les réglages ».
  bool get canAskAgain => !deniedForever;

  /// Message prêt à afficher, expliquant la suite et le geste à faire.
  String get message => switch (this) {
      LocationGrant(granted: true, background: true) =>
        'Position autorisée, même application fermée.',
      LocationGrant(granted: true) =>
        'Position autorisée au premier plan. Autorisez « tout le temps » pour '
            'que le suivi continue quand l\'écran est éteint.',
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
