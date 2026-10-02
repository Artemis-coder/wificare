import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/network/api_client.dart';
import '../domain/tracking_point.dart';

/// Accès du technicien à ses interventions.
///
/// Le technicien n'a pas de dossier client : il est identifié par son
/// `userId`, passé à l'API comme `technicianId` pour ne renvoyer que les
/// demandes qui lui sont affectées. Il ne crée ni zone ni équipement.
class TechnicianRepository {
  TechnicianRepository(this._api);

  final ApiClient _api;

  /// Demandes affectées au technicien, éventuellement filtrées par statut.
  Future<Page<Ticket>> myTickets({
    required String technicianId,
    int page = 1,
    int limit = 100,
    TicketStatus? status,
  }) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/tickets',
      query: {
        'technicianId': technicianId,
        'page': page,
        'limit': limit,
        'status': ?status?.wire,
      },
    );

    return Page.fromJson(response, Ticket.fromJson);
  }

  Future<Ticket> byId(String id) async {
    final response = await _api.get<Map<String, dynamic>>('/tickets/$id');
    return Ticket.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Établit un devis et l'envoie au client.
  ///
  /// L'envoi est définitif : le client en est prévenu et le devis ne sera plus
  /// modifiable.
  Future<QuoteInvoice> sendQuote({
    required String ticketId,
    required List<QuoteLineDraft> lines,
    String? notes,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/quote-invoices',
      data: {
        'ticketId': ticketId,
        'notes': notes,
        'lines': [
          for (final line in lines)
            {
              'description': line.description,
              'quantity': line.quantity,
              'unitPrice': line.unitPrice,
            },
        ],
      },
    );

    return QuoteInvoice.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Fait avancer la demande : le technicien est l'acteur du déplacement,
  /// c'est lui qui fait évoluer le statut jusqu'à la clôture.
  Future<Ticket> updateStatus(String id, TicketStatus status) async {
    final response = await _api.patch<Map<String, dynamic>>(
      '/tickets/$id/status',
      data: {'status': status.wire},
    );

    return Ticket.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Enregistre la position du technicien pour une demande qu'il suit.
  ///
  /// Réservé au technicien affecté : l'API refuse toute autre position. Le
  /// serveur recalcule la distance et l'ETA à chaque point et les renvoie, ce qui
  /// permet d'afficher au technicien ce que le client voit.
  Future<TrackingPoint> sharePosition({
    required String ticketId,
    required double latitude,
    required double longitude,
    double? accuracy,
    double? speed,
    double? heading,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/tickets/$ticketId/tracking',
      data: {
        'latitude': latitude,
        'longitude': longitude,
        // Les marqueurs null-aware ne conviennent pas à une entrée clé/valeur :
        // ces measures doivent rester absentes quand le capteur ne les fournit
        // pas, plutôt que d'envoyer un zéro qui ferait croire à une mesure.
        // ignore: use_null_aware_elements
        if (accuracy != null) 'accuracy': accuracy,
        // ignore: use_null_aware_elements
        if (speed != null) 'speed': speed,
        // ignore: use_null_aware_elements
        if (heading != null) 'heading': heading,
      },
    );

    return TrackingPoint.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Clôture le suivi de position d'une demande.
  ///
  /// Idempotent côté serveur : un suivi déjà arrêté renvoie un succès. L'appel
  /// est fait depuis Dart en plus du service Android, pour que l'arrêt reste
  /// connu même si l'application a été tuée pendant le trajet.
  Future<void> stopTracking(String ticketId) async {
    await _api.post<Map<String, dynamic>>('/tickets/$ticketId/tracking/stop');
  }

  /// Compte rendu d'intervention : diagnostic, solution et durée.
  ///
  /// L'API bascule automatiquement la demande en `DIAGNOSING`.
  Future<Intervention> report({
    required String ticketId,
    required Map<String, bool> checklist,
    String? diagnostic,
    String? solution,
    int? durationMin,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/tickets/$ticketId/intervention',
      data: {
        'checklist': checklist,
        if (diagnostic case final value? when value.isNotEmpty)
          'diagnostic': value,
        if (solution case final value? when value.isNotEmpty) 'solution': value,
        // Le marqueur null-aware ne convient pas à une entrée clé/valeur :
        // `durationMin` doit rester absent quand il est inconnu.
        // ignore: use_null_aware_elements
        if (durationMin != null) 'durationMin': durationMin,
      },
    );

    return Intervention.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Portefeuille : ce que les clients ont réglé sur ses devis.
  Future<TechnicianWallet> wallet({int months = 12}) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/wallet',
      query: {'months': '$months'},
    );

    return TechnicianWallet.fromJson(response['data'] as Map<String, dynamic>);
  }
}

/// Ligne de devis transmise à l'API.
class QuoteLineDraft {
  const QuoteLineDraft({
    required this.description,
    required this.quantity,
    required this.unitPrice,
  });

  final String description;
  final double quantity;
  final double unitPrice;
}
