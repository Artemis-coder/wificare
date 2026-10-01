import '../../../core/domain/json_x.dart';
import '../../../core/network/api_client.dart';

/// Avis d'intervention.
///
/// Un avis engage le client et le technicien : il est déposé par l'un, lu par
/// l'autre. L'API renvoie donc systématiquement les deux parties.
class Review {
  const Review({
    required this.id,
    required this.ticketId,
    required this.rating,
    required this.comment,
    required this.createdAt,
    required this.ticketReference,
    required this.ticketType,
    required this.zoneName,
    required this.technicianName,
  });

  final String id;
  final String ticketId;
  final int rating;
  final String? comment;
  final DateTime? createdAt;

  /// Intervention concernée : un avis est toujours rattaché à une demande.
  final String ticketReference;
  final String ticketType;
  final String zoneName;

  final String? technicianName;

  factory Review.fromJson(Map<String, dynamic> json) => Review(
    id: JsonX.str(json['id']),
    ticketId: JsonX.str(json['ticketId']),
    rating: JsonX.integer(json['rating']),
    comment: JsonX.strOrNull(json['comment']),
    createdAt: JsonX.date(json['createdAt']),
    ticketReference: _ticketString(json, 'reference'),
    ticketType: _ticketString(json, 'type'),
    zoneName:
        ((json['ticket'] as Map<String, dynamic>?)?['wifiZone']
            as Map<String, dynamic>?)?['name'] as String? ??
        '—',
    technicianName:
        (json['technician'] as Map<String, dynamic>?)?['name'] as String?,
  );
}

/// Champ de la demande rattachée, avec repli si l'API l'omettait.
String _ticketString(Map<String, dynamic> json, String field) {
  final ticket = json['ticket'] as Map<String, dynamic>?;

  return ticket?[field] as String? ?? '—';
}

/// Lecture et dépôt des avis.
class ReviewRepository {
  ReviewRepository(this._api);

  final ApiClient _api;

  /// Avis visibles par l'appelant : les siens pour un client, ceux reçus pour
  /// un technicien, tous pour la régie.
  Future<List<Review>> list({String? ticketId, String? technicianId}) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/evaluations',
      query: {'ticketId': ?ticketId, 'technicianId': ?technicianId},
    );

    return (response['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Review.fromJson)
        .toList();
  }

  /// Dépose un avis sur une intervention terminée.
  Future<void> submit({
    required String ticketId,
    required int rating,
    String? comment,
  }) async {
    await _api.post<Map<String, dynamic>>(
      '/tickets/$ticketId/evaluation',
      data: {
        'rating': rating,
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      },
    );
  }

  /// Vrai si le client peut encore déposer un avis sur cette demande.
  ///
  /// Reproduit la règle du serveur : le client ne juge que ce qui est fini.
  static bool canReview(String status) =>
      status == 'COMPLETED' || status == 'CLOSED';
}