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

  /// Jetons d'une session que l'utilisateur ne demande pas à retenir.
  ///
  /// Sans « rester connecté », la session doit s'éteindre avec l'application,
  /// comme celle d'un navigateur dont on ferme la fenêtre : les jetons restent
  /// ici, en mémoire, et le téléphone n'en garde rien sur le disque.
  String? _memoryAccessToken;
  String? _memoryRefreshToken;

  /// La session en cours est-elle conservée d'un lancement à l'autre ?
  bool _remembered = true;

  Future<bool> hasSeenOnboarding() async =>
      await _storage.read(key: _onboardingKey) == 'true';

  Future<void> markOnboardingSeen() =>
      _storage.write(key: _onboardingKey, value: 'true');

  Future<String?> readAccessToken() async =>
      _memoryAccessToken ?? await _storage.read(key: _accessTokenKey);

  Future<String?> readRefreshToken() async =>
      _memoryRefreshToken ?? await _storage.read(key: _refreshTokenKey);

  /// La session en cours survivra-t-elle à la fermeture de l'application ?
  bool get isRemembered => _remembered;

  /// Enregistre les jetons, sur le disque ou en mémoire seulement.
  ///
  /// `persist` reprend la décision de la connexion quand il est nul : c'est le
  /// cas d'un jeton renouvelé en cours de session, qui doit être écrit exactement
  /// où le premier l'a été — un jeton consulté depuis la mémoire ne peut pas
  /// repartir sur le disque.
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    bool? persist,
  }) async {
    _remembered = persist ?? _remembered;

    if (!_remembered) {
      // Un jeton laissé sur le disque par une session antérieure doit
      // disparaître : sinon il rouvrirait la session au lancement suivant, et
      // la case n'aurait rien changé pour l'utilisateur.
      await _storage.delete(key: _accessTokenKey);
      await _storage.delete(key: _refreshTokenKey);

      _memoryAccessToken = accessToken;
      _memoryRefreshToken = refreshToken;
      return;
    }

    _memoryAccessToken = null;
    _memoryRefreshToken = null;

    await _storage.write(key: _accessTokenKey, value: accessToken);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  /// Efface la session.
  ///
  /// `deleteAll` emporte le drapeau d'accueil : un nouvel utilisateur sur le
  /// même téléphone doit revoir l'explication des autorisations.
  Future<void> clear() async {
    _memoryAccessToken = null;
    _memoryRefreshToken = null;
    _remembered = true;

    await _storage.deleteAll();
  }
}