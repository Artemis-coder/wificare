import '../../../core/domain/models.dart';
import '../../../core/network/api_client.dart';

/// Lecture et mise à jour des notifications de l'utilisateur connecté.
///
/// Pas de push : l'application relance l'appel périodiquement, ce qui garde la
/// notification disponible hors ligne et au redémarrage.
class NotificationRepository {
  NotificationRepository(this._api);

  final ApiClient _api;

  /// Notifications récentes et nombre de non-lus (badge de l'application).
  Future<NotificationFeed> feed({int limit = 50, bool unreadOnly = false}) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/notifications',
      query: {
        'limit': '$limit',
        if (unreadOnly) 'unread': 'true',
      },
    );

    return NotificationFeed.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Marque une notification comme lue. L'identifiant de date de lecture est
  /// conservé : rouvrir la liste ne la repasse pas en non-lue.
  Future<void> markRead(String id) async {
    await _api.patch<Map<String, dynamic>>('/notifications/$id');
  }

  Future<void> markAllRead() async {
    await _api.patch<Map<String, dynamic>>('/notifications');
  }
}