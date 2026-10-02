import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/network/api_client.dart';

/// Devis et factures rattachés aux tickets d'un client.
class InvoiceRepository {
  InvoiceRepository(this._api);

  final ApiClient _api;

  Future<List<QuoteInvoice>> list({String? clientId, String? ticketId}) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/quote-invoices',
      query: {
        'clientId': ?clientId,
        'ticketId': ?ticketId,
      },
    );

    return (response['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(QuoteInvoice.fromJson)
        .toList();
  }

  /// Déclare le règlement d'un devis.
  ///
  /// Le client choisit son moyen de paiement ; le montant n'est jamais transmis
  /// depuis l'application, le serveur reprend celui du devis.
  Future<Payment> pay({
    required String ticketId,
    required PaymentChannel channel,
    MobileMoneyOperator? operator,
    String? transactionRef,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/tickets/$ticketId/payment',
      data: {
        'channel': channel.wire,
        'operator': ?operator?.wire,
        'transactionRef': ?transactionRef,
      },
    );

    return Payment.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Déclare un encaissement en espèces par le technicien affecté.
  ///
  /// Aucun montant n'est transmis : le serveur reprend celui du devis accepté.
  /// Le technicien constate ce qu'il a encaissé, il ne fixe pas un prix — et un
  /// montant choisi à la main ouvrirait la voie à un encaissement partiel
  /// présenté comme un règlement complet.
  Future<Payment> declareCashCollection(String ticketId) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/tickets/$ticketId/cash',
    );

    return Payment.fromJson(response['data'] as Map<String, dynamic>);
  }

  Future<QuoteInvoice> byId(String id) async {
    final response = await _api.get<Map<String, dynamic>>('/quote-invoices/$id');
    return QuoteInvoice.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Enregistre la décision du client sur le devis.
  ///
  /// Accepter et refuser sont deux gestes distincts du règlement : le client
  /// autorise ou non le travail, puis paie. Aucun montant n'est transmis ici — le
  /// serveur n'a pas à se demander ce que le client a compris du devis.
  Future<QuoteInvoice> decide(String id, {required bool accept}) async {
    final response = await _api.patch<Map<String, dynamic>>(
      '/quote-invoices/$id/decision',
      data: {'decision': accept ? 'ACCEPT' : 'REJECT'},
    );

    return QuoteInvoice.fromJson(response['data'] as Map<String, dynamic>);
  }
}
