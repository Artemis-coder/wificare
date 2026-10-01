import 'package:geolocator/geolocator.dart';

/// Relevé ponctuel de la position du client.
///
/// Une seule position, demandée par l'utilisateur, jamais suivie en continu :
/// le client n'a rien à faire d'autre que se trouver chez lui pendant que le
/// technicien arrive. Un suivi permanent de sa position n'aurait aucun usage et
/// se lirait comme une surveillance — d'où une demande explicite, une fois.
class ClientLocation {
  const ClientLocation._();

  /// Relevé effectué, ou refus de l'utilisateur ou du système.
  ///
  /// L'échec est une valeur, pas une exception : refuser sa position est un
  /// droit, et l'écran doit pouvoir expliquer la suite plutôt qu'échouer.
  static Future<ClientLocationResult> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const ClientLocationResult(
          ClientLocationFailure.servicesDisabled,
        );
      }

      var permission = await Geolocator.checkPermission();

      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        return const ClientLocationResult(ClientLocationFailure.denied);
      }

      if (permission == LocationPermission.deniedForever) {
        return const ClientLocationResult(ClientLocationFailure.deniedForever);
      }

      // Une position très ancienne ferait une ETA fausse : on borne la demande
      // à une positioning récente, quitte à ne pas avoir de point du tout.
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

  /// Message prêt à afficher, expliquant pourquoi et ce qu'il reste possible.
  String get message => switch (failure) {
        ClientLocationFailure.denied =>
          'Position non autorisée. Activez-la dans les réglages du téléphone pour '
              'recevoir l\'heure d\'arrivée du technicien.',
        ClientLocationFailure.deniedForever =>
          'Position refusée définitivement. Autorisez-la dans les réglages du '
              'téléphone pour recevoir l\'heure d\'arrivée du technicien.',
        ClientLocationFailure.servicesDisabled =>
          'La localisation est désactivée sur ce téléphone. Activez-la pour '
              'recevoir l\'heure d\'arrivée du technicien.',
        _ => 'Position introuvable. Réessayez une fois le signal GPS obtenu.',
      };
}