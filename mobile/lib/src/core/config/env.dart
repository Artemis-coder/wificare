/// Configuration applicative.
///
/// L'URL de l'API est injectée à la compilation :
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
///
/// Par défaut on vise `10.0.2.2`, l'alias de la machine hôte vu depuis
/// l'émulateur Android. Depuis un téléphone physique, passer par l'IP LAN du
/// serveur (`--dart-define=API_BASE_URL=http://192.168.x.x:3000/api`).
class AppConfig {
  const AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );

  /// Jeton de projet PostHog (`phc_…`), injecté à la compilation :
  ///   flutter run --dart-define=POSTHOG_TOKEN=phc_…
  ///
  /// Vide par défaut : sans lui, le service d'analytics est désactivé
  /// et l'application fonctionne exactement comme avant. C'est le
  /// comportement d'un build de développement local, pas d'une panne.
  ///
  /// Le jeton est public — il embarque dans l'APK, comme celui du
  /// back-office — et n'autorise que d'écrire des événements dans ce
  /// projet.
  static const String posthogToken = String.fromEnvironment(
    'POSTHOG_TOKEN',
    defaultValue: '',
  );

  /// Point d'ingestion PostHog : US ou EU, selon le projet.
  static const String posthogHost = String.fromEnvironment(
    'POSTHOG_HOST',
    defaultValue: 'https://us.i.posthog.com',
  );

  static const String appName = 'WiFi Care';

  // La version de l'application n'est pas déclarée ici. Elle est lue sur le
  // paquet installé (`core/system/app_version.dart`) : une constante écrite à la
  // main dans ce fichier est restée à `1.0.0` pendant six versions, sur trois
  // écrans, et personne ne l'a vue parce que le numéro n'était pas faux
  // pour autant que le téléphone vernissait.

  /// Contact support, partagé par les profils client et technicien.
  static const String supportEmail = 'support@wificare.ci';

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);
}
