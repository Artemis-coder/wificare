import '../../../core/domain/models.dart';import '../../../core/domain/enums.dart';

import '../../../core/network/api_client.dart';

/// Lecture/écriture des tickets.
///
/// Le client est identifié par son dossier (`clientId`) : `/auth/me` fournit
/// ce dossier, ce qui supprime le `getClients().data[0]` de l'ancienne version.
class TicketRepository {
  TicketRepository(this._api);

  final ApiClient _api;

  Future<Page<Ticket>> list({
    required String clientId,
    int page = 1,
    int limit = 20,
    TicketStatus? status,
    String? technicianId,
  }) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/tickets',
      query: {
        'clientId': clientId,
        'page': page,
        'limit': limit,
        'status': ?status?.wire,
        'technicianId': ?technicianId,
      },
    );

    return Page.fromJson(response, Ticket.fromJson);
  }

  Future<Ticket> byId(String id) async {
    final response = await _api.get<Map<String, dynamic>>('/tickets/$id');
    return Ticket.fromJson(response['data'] as Map<String, dynamic>);
  }

  Future<Ticket> create({
    required String wifiZoneId,
    required String type,
    required Priority priority,
    String? description,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/tickets',
      data: {
        'wifiZoneId': wifiZoneId,
        'type': type,
        'priority': priority.wire,
        if (description != null && description.isNotEmpty) 'description': description,
      },
    );

    return Ticket.fromJson(response['data'] as Map<String, dynamic>);
  }

  Future<Ticket> updateStatus(String id, TicketStatus status) async {
    final response = await _api.patch<Map<String, dynamic>>(
      '/tickets/$id/status',
      data: {'status': status.wire},
    );

    return Ticket.fromJson(response['data'] as Map<String, dynamic>);
  }

  Future<Evaluation> evaluate({
    required String ticketId,
    required int rating,
    String? comment,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/tickets/$ticketId/evaluation',
      data: {
        'rating': rating,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
      },
    );

    return Evaluation.fromJson(response['data'] as Map<String, dynamic>);
  }
}
