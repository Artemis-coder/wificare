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

  Future<QuoteInvoice> byId(String id) async {
    final response = await _api.get<Map<String, dynamic>>('/quote-invoices/$id');
    return QuoteInvoice.fromJson(response['data'] as Map<String, dynamic>);
  }
}
