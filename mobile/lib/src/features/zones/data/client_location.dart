import 'package:geolocator/geolocator.dart';

import '../../../core/permissions/permissions_service.dart';

/// Relevé ponctuel de la position du client.
///
/// Une seule position, demandée par l'utilisateur, jamais suivie en continu :
/// le client n'a rien à faire d'autre que se trouver chez lui pendant que le
/// technicien arrive. Un suivi permanent de sa position n'aurait aucun usage et
/// se lirait comme une surveillance — d'où une demande explicite, une fois.
///
/// L'autorisation passe par `PermissionsService`, comme celle du technicien.
/// Les deux rôles n'empruntent pas le même chemin de demande, et les faire
/// diverger produirait deux réponses différentes à la même question selon
/// l'écran : ici un refus présenté comme définitif, là un refus qui propose de
/// réessayer. Il n'y a qu'une règle Android, donc qu'une implémentation.
class ClientLocation {
  const ClientLocation._();

  /// Relevé effectué, ou refus de l'utilisateur ou du système.
  ///
  /// L'échec est une valeur, pas une exception : refuser sa position est un
  /// droit, et l'écran doit pouvoir expliquer la suite plutôt qu'échouer.
  static Future<ClientLocationResult> current() async {
    try {
      // Une seule demande d'autorisation, partagée avec le technicien, qui
      // repose d'ailleurs la question à chaque fois qu'il a besoin de sa
      // position. Un client qui a refusé au premier lancement peut donc
      // réessayer ici : Android rouvre la boîte de dialogue tant qu'il n'a pas
      // refusé définitivement.
      // `requireBackground: false` : un relevé ponctuel n'a rien à faire d'un
      // suivi permanent. Demander « tout le temps » au client lui prometrait une
      // surveillance qu'aucune fonction n'exploite — Android ne l'accorderait
      // qu'au prix d'une justification que Google Play refuse pour une
      // localisation accessorye. Le premier plan suffit : la position est lue
      // une fois, puis abandonnée jusqu'au relevé suivant.
      final grant = await PermissionsService.requestLocation(
        requireBackground: false,
      );

      if (grant.servicesDisabled) {
        return const ClientLocationResult(
          ClientLocationFailure.servicesDisabled,
        );
      }

      if (grant.deniedForever) {
        return const ClientLocationResult(
          ClientLocationFailure.deniedForever,
        );
      }

      if (!grant.granted) {
        return const ClientLocationResult(ClientLocationFailure.denied);
      }

      // Une position très ancienne ferait une ETA fausse : on borne la demande
      // à un positionnement récent, quitte à ne pas avoir de point du tout.
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );

      return ClientLocationResult.granted(position.latitude, position.longitude);
    } catch (_) {
      // Une position refusée ou indisponible ne doit pas faire tomber l'écran.
      return const ClientLocationResult(ClientLocationFailure.unavailable);
    }
  }
}

enum ClientLocationFailure { denied, deniedForever, servicesDisabled, unavailable }

class ClientLocationResult {
  const ClientLocationResult.granted(this.latitude, this.longitude)
      : failure = null;

  const ClientLocationResult(this.failure) : latitude = null, longitude = null;

  final double? latitude;
  final double? longitude;
  final ClientLocationFailure? failure;

  bool get isGranted => failure == null && latitude != null && longitude != null;

  /// Le seul recours est-il d'ouvrir les réglages du téléphone ?
  ///
  /// Vrai quand Android a fermé la boîte de dialogue pour de bon, ou quand la
  /// localisation est éteinte au niveau système. Dans les deux cas, aucun bouton
  /// « Réessayer » ne peut aboutir : n'en proposer qu'un laisserait le client
  /// appuyer indéfiniment sur un écran qui ne changera pas. C'est ce qui décide
  /// entre « Autoriser » et « Ouvrir les réglages ».
  bool get needsSettings =>
      failure == ClientLocationFailure.deniedForever ||
      failure == ClientLocationFailure.servicesDisabled;

  /// Message prêt à afficher, expliquant pourquoi et ce qu'il reste possible.
  String get message => switch (failure) {
        ClientLocationFailure.denied =>
          'Position non autorisée. Autorisez-la pour recevoir l\'heure '
              'd\'arrivée du technicien.',
        ClientLocationFailure.deniedForever =>
          'Position refusée définitivement. Ouvrez les réglages de WiFiCare '
              'pour l\'autoriser, sinon vous ne verrez pas l\'heure d\'arrivée '
              'du technicien.',
        ClientLocationFailure.servicesDisabled =>
          'La localisation est désactivée sur ce téléphone. Activez-la dans les '
              'réglages pour recevoir l\'heure d\'arrivée du technicien.',
        _ => 'Position introuvable. Réessayez une fois le signal GPS obtenu.',
      };
}
