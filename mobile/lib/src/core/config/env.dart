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

  static const String appName = 'WiFi Care';
  static const String appVersion = '1.0.0';

  /// Contact support, partagé par les profils client et technicien.
  static const String supportEmail = 'support@wificare.ci';

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);
}
