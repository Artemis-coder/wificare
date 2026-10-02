import '../../../core/network/api_client.dart';

/// Enregistrement du jeton de notification de l'appareil.
///
/// L'API rattache le jeton au compte authentifié : c'est ce qui permet au
/// serveur d'adresser la bonne demande au bon technicien.
class PushTokenRepository {
  PushTokenRepository(this._api);

  final ApiClient _api;

  Future<void> register(String token) async {
    await _api.post<Map<String, dynamic>>(
      '/push-tokens',
      data: {'token': token, 'platform': 'android'},
    );
  }

  /// Retire le jeton à la déconnexion.
  ///
  /// Sans cela, le téléphone continuerait de recevoir les notifications de la
  /// demande d'un compte dont il est sorti.
  Future<void> unregister(String token) async {
    await _api.delete<Map<String, dynamic>>(
      '/push-tokens',
      data: {'token': token},
    );
  }
}
