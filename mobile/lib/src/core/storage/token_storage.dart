import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stockage chiffré des jetons et du profil mis en cache.
///
/// Équivalent de `expo-secure-store` côté React Native : sous Android, les
/// données sont chiffrées par l'`EncryptedSharedPreferences` fourni par le
/// plugin.
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessTokenKey = 'accessToken';
  static const _refreshTokenKey = 'refreshToken';

  /// L'écran d'accueil a-t-il déjà été présenté ?
  ///
  /// Une fois pour toutes par installation : le reproposer à chaque démarrage
  /// l'agresserait, alors que les autorisations, elles, restent modifiables
  /// dans les réglages du téléphone. Ce drapeau est effacé avec les jetons à la
  /// déconnexion — ce n'est pas un secret, et la connexion doit rester possible
  /// ensuite.
  static const _onboardingKey = 'onboardingSeen';

  Future<bool> hasSeenOnboarding() async =>
      await _storage.read(key: _onboardingKey) == 'true';

  Future<void> markOnboardingSeen() =>
      _storage.write(key: _onboardingKey, value: 'true');

  Future<String?> readAccessToken() => _storage.read(key: _accessTokenKey);
  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _accessTokenKey, value: accessToken);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  /// Efface la session.
  ///
  /// `deleteAll` emporte le drapeau d'accueil : un nouvel utilisateur sur le
  /// même téléphone doit revoir l'explication des autorisations.
  Future<void> clear() => _storage.deleteAll();
}
