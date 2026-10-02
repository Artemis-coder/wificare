import '../../../core/domain/models.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';

/// Session locale : utilisateur authentifié + dossier client résolu.
class Session {
  const Session({required this.user, this.client});

  final AppUser user;
  final ClientAccount? client;

  Session copyWith({AppUser? user, ClientAccount? client}) =>
      Session(user: user ?? this.user, client: client ?? this.client);
}

/// Accès aux routes d'authentification et au profil courant.
class AuthRepository {
  AuthRepository({required this.api, required this.storage});

  final ApiClient api;
  final TokenStorage storage;

  /// Restaure la session au démarrage : si un jeton existe, on interroge
  /// `/auth/me`, sinon on renvoie `null`.
  Future<Session?> restore() async {
    final token = await storage.readAccessToken();
    if (token == null || token.isEmpty) return null;

    try {
      return await me();
    } catch (_) {
      await storage.clear();
      return null;
    }
  }

  /// Connexion par téléphone, avec le mot de passe du compte ou le code OTP de
  /// démonstration (`123456`).
  ///
  /// Le login ne renvoie pas le dossier client : `me()` est appelé juste après
  /// pour que l'application démarre avec le profil et les zones Wi-Fi.
  Future<Session> login({
    required String phone,
    String? password,
    String? otp,
    AccountType? accountType,
  }) async {
    final response = await api.post<Map<String, dynamic>>(
      '/auth/login',
      data: {
        'phone': phone,
        if (password != null && password.isNotEmpty) 'password': password,
        if (otp != null && otp.isNotEmpty) 'otp': otp,
        if (accountType != null) 'accountType': accountType.wire,
      },
    );

    await _saveTokens(response);

    return me();
  }

  /// Création de compte (technicien ou propriétaire de zone Wi-Fi).
  ///
  /// Le propriétaire reçoit immédiatement son dossier client et sa première
  /// zone ; le compte est connecté à la fin de l'inscription.
  Future<Session> register({
    required AccountType accountType,
    required String firstName,
    required String lastName,
    required String phone,
    required String password,
    String? zoneName,
    String? zoneLocation,
  }) async {
    final response = await api.post<Map<String, dynamic>>(
      '/auth/register',
      data: {
        'accountType': accountType.wire,
        'firstName': firstName,
        'lastName': lastName,
        'phone': phone,
        'password': password,
        if (zoneName != null && zoneName.isNotEmpty) 'zoneName': zoneName,
        if (zoneLocation != null && zoneLocation.isNotEmpty)
          'zoneLocation': zoneLocation,
      },
    );

    await _saveTokens(response);

    return me();
  }

  Future<void> _saveTokens(Map<String, dynamic> response) async {
    final data = response['data'] as Map<String, dynamic>;
    final tokens = data['tokens'] as Map<String, dynamic>;

    await storage.saveTokens(
      accessToken: tokens['accessToken'] as String,
      refreshToken: tokens['refreshToken'] as String,
    );
  }

  /// `/auth/me` renvoie l'utilisateur **et** son dossier client (avec ses zones
  /// Wi-Fi), ce qui évite au client mobile de deviner son profil.
  Future<Session> me() async {
    final response = await api.get<Map<String, dynamic>>('/auth/me');
    final data = response['data'] as Map<String, dynamic>;

    final clientJson = data['client'];
    return Session(
      user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
      client: clientJson is Map<String, dynamic>
          ? ClientAccount.fromJson(clientJson)
          : null,
    );
  }

  Future<void> logout() async {
    try {
      await api.post<Map<String, dynamic>>('/auth/logout');
    } catch (_) {
      // La déconnexion locale doit aboutir même si le serveur est injoignable.
    } finally {
      await storage.clear();
    }
  }
}
