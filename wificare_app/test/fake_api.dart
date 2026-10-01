import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

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
  static Map<String, dynamic> quote({String ticketId = 't-3'}) => {
    'id': 'inv-q1',
    'ticketId': ticketId,
    'type': 'QUOTE',
    'status': 'SENT',
    'totalAmount': 25000,
    'createdAt': '2026-01-30T10:00:00.000Z',
    'lines': [],
    'payment': null,
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
}
