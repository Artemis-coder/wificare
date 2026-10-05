import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geolocator_platform_interface/geolocator_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

/// Adaptateur Dio qui répond à partir d'un routage `chemin -> réponse`.
///
/// Une route peut être ciblée par méthode en la prefixant par le verbe
/// (`'PATCH /notifications'`), ce qui permet de distinguer un `GET` d'un
/// `PATCH` sur une même URL.
class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter(this.routes);

  final Map<String, Object? Function(String path, dynamic body)> routes;
  final List<String> calls = [];

  /// Réponses de flux, par chemin : le corps est envoyé puis la connexion reste
  /// ouverte, comme le fait un vrai `text/event-stream`.
  ///
  /// Un handler de flux qui renvoie le corps en une seule pièce suffit à tester
  /// la réception d'une notification ; il ne reproduit pas la coupe des morceaux
  /// au milieu d'une ligne, que le test de découpage couvre séparément.
  final Map<String, Stream<Uint8List>> streams = {};

  /// Statut HTTP à renvoyer pour une route donnée, par défaut 200.
  ///
  /// Permet de simuler un refus (`403`) sans dupliquer la route.
  final Map<String, int> statuses = {};

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final path = options.path;
    // `options.path` exclut les query params : on les recolle pour tracer et
    // router sur l'URL réellement demandée.
    final query = options.uri.query.isEmpty ? '' : '?${options.uri.query}';
    calls.add('${options.method} $path$query');

    final body = options.method == 'GET' || options.method == 'DELETE'
        ? null
        : (options.data is String ? jsonDecode(options.data as String) : options.data);

    final handler =
        routes['${options.method} $path'] ??
        routes[path] ??
        routes[_withoutQuery(path)] ??
        routes[options.uri.toString()];

    final stream = streams['${options.method} $path'] ?? streams[path];

    if (stream != null) {
      return ResponseBody(
        stream,
        statuses['${options.method} $path'] ?? statuses[path] ?? 200,
        headers: {
          Headers.contentTypeHeader: ['text/event-stream'],
        },
      );
    }

    if (handler == null) {
      return ResponseBody.fromString(
        jsonEncode({'error': 'Route non mockée : $path'}),
        404,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }

    final result = handler(path, body);
    return ResponseBody.fromString(
      jsonEncode(result),
      statuses['${options.method} $path'] ?? statuses[path] ?? 200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  String _withoutQuery(String path) => path.split('?').first;

  @override
  void close({bool force = false}) {}
}

/// Jeux de données minimaux imitant les réponses du backend.
abstract final class FakeApiData {
  static const user = {
    'id': 'user-1',
    'name': 'Kouassi Marc',
    'phone': '+2250707070707',
    'role': 'CLIENT',
    'status': 'ACTIVE',
    'createdAt': '2026-01-30T10:00:00.000Z',
  };

  static const zone = {
    'id': 'zone-1',
    'clientId': 'client-1',
    'name': 'WiFi Zone Angre 8e Tranche',
    'location': 'Abidjan, Cocody Angre',
    'status': 'ACTIVE',
    'createdAt': '2026-01-30T10:00:00.000Z',
    'equipments': [
      {
        'id': 'eq-1',
        'wifiZoneId': 'zone-1',
        'type': 'ROUTER',
        'brand': 'TP-Link',
        'model': 'Archer C6',
        'serialNumber': 'SN-12345',
        'createdAt': '2026-01-30T10:00:00.000Z',
      },
    ],
  };

  /// Zone déclarée par son propriétaire et pas encore validée par la plateforme.
  ///
  /// Elle existe pour leur permettre de préparer leurs équipements, mais aucune
  /// demande d'intervention ne peut la concerner tant qu'elle est en attente.
  static const pendingZone = {
    'id': 'zone-2',
    'clientId': 'client-1',
    'name': 'WiFi Zone Riviera 2',
    'location': 'Abidjan, Riviera 2',
    'status': 'PENDING',
    'createdAt': '2026-02-02T10:00:00.000Z',
    'equipments': <Map<String, dynamic>>[],
  };

  /// Compte technicien : pas de dossier client.
  static const technician = {
    'id': 'tech-1',
    'name': 'Jean Dupont',
    'phone': '2250102030405',
    'role': 'TECHNICIAN',
    'status': 'ACTIVE',
    'createdAt': '2026-01-30T10:00:00.000Z',
  };

  static const client = {
    'id': 'client-1',
    'name': 'M. Kouassi',
    'contact': '+2250707070707',
    'address': 'Cocody Angre',
    'latitude': null,
    'longitude': null,
    'userId': 'user-1',
    'createdAt': '2026-01-30T10:00:00.000Z',
    'wifiZones': [zone],
  };

  /// Dossier dont une zone reste en attente de validation de la plateforme.
  static Map<String, dynamic> get clientWithPendingZone => {
    ...client,
    'wifiZones': [zone, pendingZone],
  };

  /// Suivi de position en cours, tel que le serveur le renvoie sur un ticket.
  static Map<String, dynamic> tracking({
    bool active = true,
    int? etaMinutes = 7,
    int? distanceMeters = 2400,
    int minutesAgo = 2,
  }) => {
    'active': active,
    'etaMinutes': etaMinutes,
    'distanceMeters': distanceMeters,
    'recordedAt':
        DateTime.now().subtract(Duration(minutes: minutesAgo)).toIso8601String(),
    'technicianName': 'Koné Ibrahim',
  };

  static Map<String, dynamic> ticket(
    String id,
    String reference,
    String status, {
    String? technicianId,
    Map<String, dynamic>? quoteInvoice,
    Map<String, dynamic>? tracking,
  }) => {
    'id': id,
    'reference': reference,
    'type': 'Panne totale',
    'priority': 'HIGH',
    'status': status,
    'scheduledFor': null,
    'description': 'Coupure intermittente depuis 2 jours',
    'clientId': 'client-1',
    'wifiZoneId': 'zone-1',
    'technicianId': technicianId,
    'createdAt': '2026-01-30T10:00:00.000Z',
    'updatedAt': '2026-01-30T10:00:00.000Z',
    'client': client,
    'wifiZone': zone,
    'technician': technicianId == null ? null : technician,
    'quoteInvoice': quoteInvoice,
    'tracking': tracking,
  };

  /// Devis en attente de décision du client.
  ///
  /// Le statut est paramétrable parce que c'est lui qui commande ce que le
  /// technicien peut faire : un devis `SENT` bloque la réparation, un devis
  /// `ACCEPTED` ou `PAID` la débloque, un devis `REJECTED` rend la demande au
  /// technicien.
  ///
  /// `PAID` porte son règlement : sans lui, le devis semblerait payé sans
  /// trace de paiement, et un écran qui lit `payment` n'aurait rien à montrer.
  static Map<String, dynamic> quote({
    String ticketId = 't-3',
    String status = 'SENT',
    String id = 'inv-q1',
  }) => {
    'id': id,
    'ticketId': ticketId,
    'type': 'QUOTE',
    'status': status,
    'totalAmount': 25000,
    'createdAt': '2026-01-30T10:00:00.000Z',
    'lines': [],
    'payment': status == 'PAID'
        ? {
            'id': 'pay-1',
            'quoteInvoiceId': id,
            'amount': 25000,
            'channel': 'MOBILE_MONEY',
            'operator': 'WAVE',
            'transactionRef': 'TRX-4821930',
            'reference': null,
            'status': 'COMPLETED',
            'createdAt': '2026-01-30T11:00:00.000Z',
          }
        : null,
  };

  static Map<String, dynamic> ticketPage(List<Map<String, dynamic>> items) => {
    'data': {
      'items': items,
      'total': items.length,
      'page': 1,
      'limit': 100,
      'totalPages': 1,
    },
  };

  /// Présence du technicien, telle que le serveur la renvoie.
  ///
  /// `minutesSinceSeen` sert à produire un technicien « en ligne mais
  /// injoignable » : son application a cessé de parler au serveur alors qu'il a
  /// toujours demandé à recevoir des demandes. L'écart entre les deux est
  /// exactement ce que l'écran doit annoncer, sinon il afficherait un « en ligne »
  /// qui ne recevra rien.
  static Map<String, dynamic> presence({
    required bool online,
    int? minutesSinceSeen,
    DateTime? onlineSince,
  }) => {
    'isOnline': online,
    'onlineSince': online
        ? (onlineSince ??
              DateTime.now()
                  .subtract(const Duration(minutes: 40))
                  .toIso8601String())
        : null,
    'lastSeenAt': online
        ? (minutesSinceSeen == null
              ? DateTime.now().toIso8601String()
              : DateTime.now()
                    .subtract(Duration(minutes: minutesSinceSeen))
                    .toIso8601String())
        : null,
  };

  /// Demande proposée à un technicien, en attente de sa réponse.
  ///
  /// La demande est embarquée dans l'offre : tant qu'il ne l'a pas prise, il n'a
  /// aucun droit de lecture dessus, et le serveur ne lui renverrait que ce
  /// contenu s'il ne le faisait pas. Un test qui n'afficherait que la référence
  /// ne vérifierait donc rien de ce que l'écran des offres doit montrer.
  static Map<String, dynamic> offer({
    required String id,
    String ticketId = 't-offer-1',
    String reference = '#TK-2026-050',
    String priority = 'URGENT',
    String description = 'Plus aucun accès Internet depuis ce matin.',
    String? clientContact = '+2250707070707',
    bool located = true,
  }) => {
    'id': id,
    'offeredAt': DateTime.now().toIso8601String(),
    'ticket': {
      'id': ticketId,
      'reference': reference,
      'type': 'Connexion impossible',
      'priority': priority,
      'description': description,
      'status': 'NEW',
      'createdAt': DateTime.now()
          .subtract(const Duration(minutes: 20))
          .toIso8601String(),
      'wifiZone': {
        'id': 'zone-offer',
        'name': 'WiFi Zone Cocody Riviera',
        'location': 'Cocody Riviera 2',
        'latitude': located ? 5.3595 : null,
        'longitude': located ? -3.9677 : null,
      },
      'client': {
        'id': 'client-offer',
        'name': 'Mme Aya Traoré',
        'contact': clientContact,
      },
      'files': <dynamic>[],
    },
  };

  /// Réponse `GET /technicians/offers` : la présence et la file dans le même
  /// objet, parce qu'elles arrivent dans le même appel — et que cet appel est
  /// aussi ce qui fait tourner la répartition.
  static Map<String, dynamic> offerPoll({
    required bool online,
    List<Map<String, dynamic>> items = const [],
    int? minutesSinceSeen,
  }) => {
    'data': {
      ...presence(online: online, minutesSinceSeen: minutesSinceSeen),
      'serverNow': DateTime.now().toIso8601String(),
      'items': items,
    },
  };

  /// Notification in-app, avec `readAt` renseigné si elle a été lue.
  static Map<String, dynamic> notification(
    String id,
    String type,
    String title,
    String body, {
    String? ticketId,
    bool read = false,
  }) => {
    'id': id,
    'userId': 'user-1',
    'type': type,
    'title': title,
    'body': body,
    'ticketId': ticketId,
    'readAt': read ? '2026-01-30T11:00:00.000Z' : null,
    'createdAt': '2026-01-30T10:30:00.000Z',
  };

  /// Réponse `GET /notifications` : la liste et le nombre de non-lus renvoyés
  /// par le backend.
  static Map<String, dynamic> notificationFeed(List<Map<String, dynamic>> items) => {
    'data': {
      'items': items,
      'unreadCount': items.where((item) => item['readAt'] == null).length,
    },
  };

  /// Avis d'intervention.
  ///
  /// Le serveur renvoie systématiquement le client et le technicien : un avis
  /// engage les deux parties.
  static Map<String, dynamic> evaluation({
    required String id,
    required String ticketId,
    required String reference,
    required int rating,
    String? comment,
    String? technicianName,
  }) => {
    'id': id,
    'ticketId': ticketId,
    'rating': rating,
    'comment': comment,
    'createdAt': '2026-01-30T10:00:00.000Z',
    'client': {'id': 'user-1', 'name': 'Kouassi Marc', 'phone': '2250707070707'},
    'technician': technicianName == null
        ? null
        : {'id': 'tech-1', 'name': technicianName, 'phone': '2250102030405'},
    'ticket': {
      'id': ticketId,
      'reference': reference,
      'type': 'Panne totale',
      'status': 'COMPLETED',
      'wifiZone': {'name': 'WiFi Zone Angre 8e Tranche'},
    },
  };

/// Portefeuille technicien : deux mois d'encaissements.
///
/// Le montant du mois est la somme de ses deux règlements (25 000 + 30 000),
/// et le cumulé ajoute celui de janvier — c'est cet écart qui vérifie que la
/// ventilation mensuelle et le total ne sont pas calculés l’un par l’autre.
static Map<String, dynamic> wallet() => {
  'data': {
    'totalAmount': 70000,
    'currentMonthKey': '2026-02',
    'currentMonthLabel': 'février 2026',
    'currentMonthAmount': 55000,
    'paidInterventions': 3,
    'refundedAmount': 0,
    'byChannel': {'MOBILE_MONEY': 40000, 'CASH': 30000},
    'monthly': [
      {
        'key': '2026-02',
        'label': 'février 2026',
        'amount': 55000,
        'count': 2,
        'byChannel': {'MOBILE_MONEY': 40000, 'CASH': 15000},
      },
      {
        'key': '2026-01',
        'label': 'janvier 2026',
        'amount': 15000,
        'count': 1,
        'byChannel': {'CASH': 15000},
      },
    ],
    'payments': [
      {
        'id': 'pay-1',
        'amount': 25000,
        'channel': 'MOBILE_MONEY',
        'operator': 'WAVE',
        'transactionRef': 'WM-8891',
        'paidAt': '2026-02-18T09:00:00.000Z',
        'ticketId': 't-tech-1',
        'ticketReference': '#TK-2026-001',
        'ticketStatus': 'COMPLETED',
        'status': 'COMPLETED',
      },
      {
        'id': 'pay-2',
        'amount': 30000,
        'channel': 'CASH',
        'operator': null,
        'transactionRef': null,
        'paidAt': '2026-02-10T09:00:00.000Z',
        'ticketId': 't-tech-1',
        'ticketReference': '#TK-2026-002',
        'ticketStatus': 'REPAIRING',
        'status': 'COMPLETED',
      },
    ],
  },
};

/// Portefeuille après un remboursement.
///
/// Le remboursement figure dans l'historique mais **pas** dans le cumulé : c'est
/// exactement l'écart que l'écran doit laisser voir. Le total vaut 70 000 alors
/// que la somme des lignes affichées vaut 95 000 — sans la ligne « dont
/// remboursés », le technicien lirait son relevé comme faux.
static Map<String, dynamic> walletWithRefund() => {
  'data': {
    'totalAmount': 70000,
    'currentMonthKey': '2026-02',
    'currentMonthLabel': 'février 2026',
    'currentMonthAmount': 55000,
    'paidInterventions': 3,
    'refundedAmount': 25000,
    'byChannel': {'MOBILE_MONEY': 40000, 'CASH': 30000},
    'monthly': [
      {
        'key': '2026-02',
        'label': 'février 2026',
        'amount': 55000,
        'count': 2,
        'byChannel': {'MOBILE_MONEY': 40000, 'CASH': 15000},
      },
    ],
    'payments': [
      {
        'id': 'pay-3',
        'amount': 25000,
        'channel': 'MOBILE_MONEY',
        'operator': 'WAVE',
        'transactionRef': 'WM-8891',
        'paidAt': '2026-02-18T09:00:00.000Z',
        'ticketId': 't-tech-1',
        'ticketReference': '#TK-2026-001',
        'ticketStatus': 'CANCELLED',
        'status': 'REFUNDED',
      },
      {
        'id': 'pay-2',
        'amount': 30000,
        'channel': 'CASH',
        'operator': null,
        'transactionRef': null,
        'paidAt': '2026-02-10T09:00:00.000Z',
        'ticketId': 't-tech-1',
        'ticketReference': '#TK-2026-002',
        'ticketStatus': 'REPAIRING',
        'status': 'COMPLETED',
      },
    ],
  },
};

/// Portefeuille sans aucun encaissement.
static Map<String, dynamic> emptyWallet() => {
  'data': {
    'totalAmount': 0,
    'currentMonthKey': '2026-02',
    'currentMonthLabel': 'février 2026',
    'currentMonthAmount': 0,
    'paidInterventions': 0,
    'refundedAmount': 0,
    'byChannel': <String, dynamic>{},
    'monthly': <dynamic>[],
    'payments': <dynamic>[],
  },
};
}

/// Localisation simulée.
///
/// `geolocator` passe par une interface de plateforme, interceptable en test
/// sans passer par un canal natif : c'est le seul moyen de faire croire à
/// l'application qu'une autorisation a été accordée, un test widget n'ayant
/// aucun accès au PermissionDialog d'Android.
class FakeGeolocator extends GeolocatorPlatform
    with MockPlatformInterfaceMixin {
  FakeGeolocator({
    this.serviceEnabled = true,
    this.permission = LocationPermission.whileInUse,
  });

  bool serviceEnabled;
  LocationPermission permission;

  /// Nombre de demandes effectivement faites : permet de vérifier qu'un second
  /// appel n'est pas relancé une fois l'autorisation accordée.
  int requestCount = 0;

  @override
  Future<bool> isLocationServiceEnabled() async => serviceEnabled;

  @override
  Future<LocationPermission> checkPermission() async => permission;

  @override
  Future<LocationPermission> requestPermission() async {
    requestCount++;
    return permission;
  }

  @override
  Future<bool> openAppSettings() async => true;
}

/// Installe une localisation simulée, et rend l'instance pour pouvoir la muter
/// en cours de test. À retirer avec [removeFakeGeolocator].
FakeGeolocator installFakeGeolocator({
  bool serviceEnabled = true,
  LocationPermission permission = LocationPermission.whileInUse,
}) {
  final fake = FakeGeolocator(
    serviceEnabled: serviceEnabled,
    permission: permission,
  );

  GeolocatorPlatform.instance = fake;
  return fake;
}

void removeFakeGeolocator() {
  GeolocatorPlatform.instance = FakeGeolocator();
}
