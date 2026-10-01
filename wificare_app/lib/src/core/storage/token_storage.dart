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

  Future<String?> readAccessToken() => _storage.read(key: _accessTokenKey);
  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _accessTokenKey, value: accessToken);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  Future<void> clear() => _storage.deleteAll();
}
