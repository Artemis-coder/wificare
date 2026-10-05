import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:wificare_app/src/app.dart';
import 'package:wificare_app/src/core/network/api_client.dart';
import 'package:wificare_app/src/core/providers/infra_providers.dart';
import 'package:wificare_app/src/core/push/push_service.dart';
import 'package:wificare_app/src/core/storage/token_storage.dart';
import 'package:wificare_app/src/core/widgets/notification_bell.dart';

import 'fake_api.dart';

/// Service de notifications simulé, déjà « tapped ».
///
/// Le vrai service ne se laisse pas piloter depuis un test : ses écouteurs sont
/// posés par Firebase, absent de l'environnement de test. Ce qui est vérifié ici
/// n'est pas la réception du message — c'est le trajet qui suit, celui qui décide
/// où l'utilisateur atterrit. Il est donc remplacé par un service qui rend une
/// cible déjà choisie.
class FakePushService extends PushService {
  FakePushService({this.offerId, this.ticketId});

  final String? offerId;
  final String? ticketId;

  @override
  String? takePendingOfferId() => offerId;

  @override
  String? takePendingTicketId() => ticketId;
}

/// Canal Android du suivi de position : mêmes noms que
/// `com.wificare.mobile/location` côté Kotlin.
const MethodChannel _locationChannel = MethodChannel('com.wificare.mobile/location');

/// Simule la plateforme de suivi pour un test.
///
/// Un test widget n'a pas de côté Kotlin : sans ce relais, aucun point ne serait
/// jamais posté. Installée sans `lastLocation`, elle renvoie une position nulle :
/// c'est le cas d'un téléphone dont le GPS n'a encore rien donné.
void installLocationPlatform({Map<String, dynamic>? lastLocation}) {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(_locationChannel, (call) async {
        return switch (call.method) {
          'start' => <String, dynamic>{
            'started': true,
            'ticketId': (call.arguments as Map)['ticketId'],
            'lastLocation': lastLocation,
          },
          'stop' || 'status' => <String, dynamic>{'running': false},
          _ => null,
        };
      });
}

/// Simule une plateforme **absente**.
///
/// C'est le cas réel hors Android, où le canal n'a pas d'implémentation : il
/// faut que l'appel lève `MissingPluginException` pour que le code prenne la
/// branche « suivi indisponible ». Le relais est donc installé et lève
/// volontairement l'exception, plutôt que de compter sur une absence de
/// relais — le canal sans gestionnaire ne répond tout simplement jamais dans un
/// test widget, ce qui laisserait l'écran bloqué sur « en cours ».
void installAbsentLocationPlatform() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        _locationChannel,
        (call) async => throw MissingPluginException(
          'No implementation found for method ${call.method} '
          'on channel ${_locationChannel.name}',
        ),
      );
}

/// Retire la plateforme simulée.
void removeLocationPlatform() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(_locationChannel, null);
}

const Map<String, String> _session = {
  'accessToken': 'access-tech',
  'refreshToken': 'refresh-tech',
};

/// Notifications simulées du technicien, mutées par le marquage comme par la
/// base : sans cela le badge se repeuplerait à chaque relecture.
List<Map<String, dynamic>> _seedNotifications() => [
  FakeApiData.notification(
    'n-1',
    'TICKET_ASSIGNED',
    'Nouvelle intervention assignée',
    '#TK-2026-001 · WiFi Zone Angre 8e Tranche · Panne totale.',
    ticketId: 't-tech-1',
  ),
  FakeApiData.notification(
    'n-2',
    'TICKET_STATUS_CHANGED',
    '#TK-2026-001 : En route',
    'La demande est maintenant En route.',
    ticketId: 't-tech-1',
    read: true,
  ),
];

/// Parcours technicien : l'espace doit être distinct de celui du client.
/// Règles métier vérifiées ici : un technicien ne gère ni zone Wi-Fi ni
/// équipement, il reçoit des demandes assignées et les fait avancer.
void main() {
  late FakeHttpAdapter adapter;
  late List<Map<String, dynamic>> notifications;

  /// Statut courant de `t-tech-1`.
  ///
  /// Le détail et la liste le lisent au lieu d renvoyer toujours « AFFECTÉ » :
  /// sinon l'écran resterait figé après « Démarrer le déplacement » et ne
  /// pourrait jamais proposer « Commencer le diagnostic », c'est-à-dire la fin
  /// du suivi.
  var status = 'ASSIGNED';

  // La demande peut porter un devis, ce qui change les actions proposées.
  var hasQuote = false;

  // Le statut du devis commande la réparation : `SENT` la bloque, `ACCEPTED`
  // la débloque, `REJECTED` rend la demande au technicien.
  var quoteStatus = 'SENT';

  // Le portefeuille est paramétrable pour la même raison : un relevé sans
  // encaissement et un relevé après un remboursement n'affichent pas les mêmes
  // chiffres, et il faut pouvoir les déclencher sans réécrire le harnais.
  Object? walletPayload = FakeApiData.wallet();

  // Une deuxième demande n'est affectée qu'au milieu du test qui le demande :
  // la service par défaut reste celle d'un technicien qui n'a qu'une demande.
  var assigned = true;

  // Un encaissement déclaré par le technicien, et sa réponse d'API. Ils sont
  // observés pour vérifier qu'un encaissement passe bien par le serveur, et
  // qu'un refus du serveur est remonté tel quel.
  final cashCalls = <String>[];
  String? cashError;

  // Le circuit de répartition : présence du technicien, file des demandes
  // proposées, et issue de la prise ou du refus. Chaque test repart d'un
  // technicien hors ligne et sans file — un circuit qui tournerait déjà
  // masquerait ce qu'un test cherche à vérifier.
  var online = false;

  /// Minutes écoulées depuis le dernier signal du technicien : un valeur
  /// positive produit la situation « en ligne, mais injoignable ».
  var minutesSinceSeen = 0;

  var offers = <Map<String, dynamic>>[];

  /// Refus du serveur sur une prise : c'est la course entre deux techniciens,
  /// et elle se joue par un `409` que l'application doit montrer tel quel.
  String? acceptError;

  /// Une demande remise dans la file n'appartient plus au technicien.
  var released = false;

  setUp(() {
    status = 'ASSIGNED';
    notifications = _seedNotifications();
    walletPayload = FakeApiData.wallet();
    cashCalls.clear();
    cashError = null;

    // `hasQuote` et `quoteStatus` pilotent les actions du détail. Laissés par
    // le test précédent, ils feraient échouer le suivant qui suppose une
    // demande sans devis : chaque test part d'une demande neutre, et pose son
    // devis au moment où il en a besoin.
    hasQuote = false;
    quoteStatus = 'SENT';
    assigned = true;

    // Circuit de répartition remis à zéro pour les mêmes raisons.
    online = false;
    minutesSinceSeen = 0;
    offers = <Map<String, dynamic>>[];
    acceptError = null;
    released = false;


    // Plateforme de suivi absente par défaut : c'est le cas de tout test qui ne
    // s'intéresse pas à la localisation, et cela évite qu'un appel de canal sans
    // gestionnaire reste en suspens jusqu'au délai maximal. Le test dédié
    // installe une plateforme complète à la place.
    installAbsentLocationPlatform();
    addTearDown(removeLocationPlatform);

    // Autorisation de localisation accordée par défaut : le suivi la redemande
    // au moment du départ, et un test qui ne s'en occupe pas doit passer par
    // là sans être bloqué par une boîte de dialogue qu'aucun écran ne montre.
    installFakeGeolocator();
    addTearDown(removeFakeGeolocator);
    FlutterSecureStorage.setMockInitialValues({});

    // Version du paquet installé : c'est elle que le profil affiche.
    PackageInfo.setMockInitialValues(
      appName: 'WiFi Care',
      packageName: 'ci.wificare.app',
      version: '1.6.0',
      buildNumber: '7',
      buildSignature: '',
    );

    adapter = FakeHttpAdapter({
      '/auth/login': (_, _) => {
        'data': {
          'user': FakeApiData.technician,
          'tokens': {'accessToken': 'access-tech', 'refreshToken': 'refresh-tech'},
        },
      },
      // Un technicien n'a pas de dossier client.
      '/auth/me': (_, _) => {
        'data': {'user': FakeApiData.technician, 'client': null},
      },
      '/auth/refresh': (_, _) => {
        'data': {'accessToken': 'access-2', 'refreshToken': 'refresh-2'},
      },
      '/auth/logout': (_, _) => {
        'data': {'message': 'Déconnexion réussie'},
      },
      '/tickets/t-tech-1': (_, _) => {
        'data': FakeApiData.ticket(
          't-tech-1',
          '#TK-2026-001',
          released ? 'NEW' : status,
          technicianId: released ? null : 'tech-1',
          // Un devis envoyé retire l'annulation au technicien : le client en a
          // connaissance et doit trancher.
          quoteInvoice: hasQuote
              ? FakeApiData.quote(ticketId: 't-tech-1', status: quoteStatus)
              : null,
        ),
      },
      // Le circuit de répartition. La présence et la file sont relues par le
      // même appel, et c'est ce même appel qui fait tourner la répartition :
      // le serveur ne se contente donc pas de répondre, il propose au passage
      // les demandes en attente aux techniciens disponibles.
      '/technicians/offers': (_, _) => FakeApiData.offerPoll(
        online: online,
        minutesSinceSeen: minutesSinceSeen,
        items: offers,
      ),
      'POST /technicians/presence': (path, body) {
        online = (body as Map)['online'] as bool;

        return {
          'data': FakeApiData.presence(online: online, minutesSinceSeen: 0),
        };
      },
      'POST /offers/o-1/accept': (path, _) {
        // La course se perd par un vrai statut HTTP : un `200` porteur d'une
        // erreur ne remonterait pas dans l'application, et le test passerait à
        // côté de ce qu'il est censé vérifier.
        if (acceptError != null) {
          adapter.statuses['POST /offers/o-1/accept'] = 409;
          return {'error': acceptError};
        }

        offers.removeWhere((item) => item['id'] == 'o-1');
        assigned = true;

        return {
          'data': FakeApiData.ticket(
            't-offer-1',
            '#TK-2026-050',
            'ASSIGNED',
            technicianId: 'tech-1',
          ),
        };
      },
      'POST /offers/o-1/decline': (path, _) {
        offers.removeWhere((item) => item['id'] == 'o-1');

        return {
          'data': {'declinedAt': '2026-02-20T09:00:00.000Z'},
        };
      },
      // La demande vient d'être prise : elle est au technicien, et son détail
      // redevient lisible — il en était privé tant qu'elle n'était qu'une offre.
      '/tickets/t-offer-1': (_, _) => {
        'data': FakeApiData.ticket(
          't-offer-1',
          '#TK-2026-050',
          'ASSIGNED',
          technicianId: 'tech-1',
        ),
      },
      'POST /tickets/t-tech-1/release': (path, _) {
        released = true;
        status = 'NEW';

        return {
          'data': FakeApiData.ticket(
            't-tech-1',
            '#TK-2026-001',
            'NEW',
            technicianId: null,
          ),
        };
      },
      // Le rapport deposition du compte rendu. Le serveur le refuse en double,
      // et la premiere ecriture suffit ici.
      'POST /tickets/t-tech-1/intervention': (_, body) {
        final data = (body as Map).cast<String, dynamic>();

        if (data['diagnostic'] == null || data['solution'] == null) {
          return {'error': 'Le rapport est incomplet'};
        }

        return {
          'data': {
            'id': 'int-1',
            'ticketId': 't-tech-1',
            'checklist': {},
            'diagnostic': data['diagnostic'],
            'solution': data['solution'],
            'durationMin': null,
            'createdAt': '2026-01-30T12:00:00.000Z',
          },
        };
      },
      '/tickets/t-tech-1/status': (path, body) {
        status = (body as Map)['status'] as String;
        return {
          'data': FakeApiData.ticket(
            't-tech-1',
            '#TK-2026-001',
            status,
            technicianId: 'tech-1',
          ),
        };
      },
      // Suivi de position : l'API renvoie la distance et l'ETA qu'elle a
      // recalculées, et le technicien voit exactement ce que voit le client.
      '/tickets/t-tech-1/tracking': (path, body) {
        final point = (body as Map);
        expect(
          point['latitude'],
          isA<num>(),
          reason: 'un point sans coordonnées serait refusé par le serveur',
        );

        return {
          'data': {
            'ticketId': 't-tech-1',
            'distanceMeters': 840,
            'etaMinutes': 7,
            'destination': 'Cocody Angre',
            'startedAt': '2026-01-30T10:00:00.000Z',
            'recordedAt': '2026-01-30T10:05:00.000Z',
          },
        };
      },
      '/wallet': (_, _) => walletPayload,
      'POST /tickets/t-tech-1/cash': (path, _) {
        cashCalls.add(path);

        // Un refus du serveur est un vrai statut HTTP, pas un corps 200 : le
        // message ne remonterait pas autrement, et le test passerait à côté de
        // ce qu'il est censé vérifier.
        if (cashError != null) {
          adapter.statuses['POST /tickets/t-tech-1/cash'] = 403;
          return {'error': cashError};
        }

        return {
          'data': {
            'id': 'pay-cash',
            'quoteInvoiceId': 'inv-q1',
            'amount': 25000,
            'channel': 'CASH',
            'operator': null,
            'transactionRef': null,
            'reference': null,
            'proofUrl': null,
            'status': 'COMPLETED',
            'createdAt': '2026-01-30T11:00:00.000Z',
          },
        };
      },
      '/tickets/t-tech-1/tracking/stop': (_, _) => {
        'data': {'stoppedAt': '2026-01-30T10:20:00.000Z'},
      },
      // Le nombre de demandes renvoyé change dès que l'assignation est reçue :
      // le test vérifie que c'est la notification, et non un chargement de page,
      // qui fait apparaître la nouvelle demande.
      // Le second ticket n'est servi qu'une fois `assigned` vrai : c'est ce qui
      // permet de vérifier que la notification — et non un rechargement manuel —
      // fait apparaître la demande. Une demande remise dans la file sort de la
      // liste : elle n'est plus à ce technicien.
      '/tickets': (path, body) => FakeApiData.ticketPage([
        if (!released)
          FakeApiData.ticket(
            't-tech-1',
            '#TK-2026-001',
            status,
            technicianId: 'tech-1',
          ),
        if (assigned)
          FakeApiData.ticket(
            't-tech-2',
            '#TK-2026-002',
            'COMPLETED',
            technicianId: 'tech-1',
          ),
      ]),
      '/notifications': (_, _) => FakeApiData.notificationFeed(notifications),
      '/notifications/n-1': (_, _) {
        for (final item in notifications) {
          if (item['id'] == 'n-1') item['readAt'] = '2026-01-30T12:00:00.000Z';
        }
        return {
          'data': notifications.firstWhere((item) => item['id'] == 'n-1'),
        };
      },
      // Le serveur ne renvoie au technicien que les avis qui le concernent.
      '/evaluations': (_, _) => {
        'data': [
          FakeApiData.evaluation(
            id: 'e-1',
            ticketId: 't-tech-2',
            reference: '#TK-2026-002',
            rating: 5,
            comment: 'Intervention rapide et soignée.',
            technicianName: 'Jean Dupont',
          ),
          FakeApiData.evaluation(
            id: 'e-2',
            ticketId: 't-tech-3',
            reference: '#TK-2026-003',
            rating: 2,
            comment: 'Retard sur le rendez-vous.',
            technicianName: 'Jean Dupont',
          ),
        ],
      },
    });
  });

  /// [onboardingSeen] vaut `true` par défaut : l'écran d'accueil des
  /// autorisations est vérifié ailleurs, il ne doit pas détourner ces parcours.
  ///
  /// [push] permet de simuler une notification sur laquelle le technicien a
  /// tapé : le vrai service ne peut pas être atteint depuis un test, Firebase
  /// n'y existant pas.
  Widget buildApp({bool onboardingSeen = true, PushService? push}) {
    final dio = Dio();
    dio.httpClientAdapter = adapter;
    final refreshDio = Dio()..httpClientAdapter = adapter;
    final storage = TokenStorage();

    return ProviderScope(
      overrides: [
        apiClientProvider.overrideWith(
          (ref) => ApiClient(
            tokenStorage: storage,
            dio: dio,
            refreshDio: refreshDio,
          ),
        ),
        onboardingSeenProvider.overrideWithValue(onboardingSeen),
        if (push != null) pushServiceProvider.overrideWithValue(push),
      ],
      child: const WiFiCareApp(),
    );
  }

  Future<void> settle(WidgetTester tester, {int steps = 12}) async {
    for (var i = 0; i < steps; i++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
  }

  Future<void> pumpApp(WidgetTester tester, {PushService? push}) async {
    tester.view.physicalSize = const Size(1280, 2856);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(buildApp(push: push));
    await settle(tester);
  }

  /// Simule le retour au premier plan, le geste qui suit un tap sur une
  /// notification alors que l'application était fermée.
  ///
  /// L'événement passe par le canal du moteur plutôt que par
  /// `handleAppLifecycleStateChanged`, déprécié : c'est ce que reçoit réellement
  /// l'application sur un téléphone.
  Future<void> resumeApp(WidgetTester tester) async {
    tester.binding.defaultBinaryMessenger.handlePlatformMessage(
      'flutter/lifecycle',
      const StringCodec().encodeMessage(AppLifecycleState.resumed.toString()),
      (_) {},
    );

    await settle(tester, steps: 20);
  }

  /// Se connecte en technicien, comme le ferait un vrai téléphone.
  Future<void> loginTechnician(WidgetTester tester) async {
    await tester.enterText(find.byType(TextField).at(0), '0102030405');
    await settle(tester);
    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 24);
  }

  testWidgets('connexion technicien : accueil dédié, sans zones ni factures', (
    tester,
  ) async {
    await pumpApp(tester);

    await tester.enterText(find.byType(TextField).at(0), '0102030405');
    await settle(tester);
    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 24);

    expect(find.text('Bonjour Jean Dupont'), findsOneWidget);
    expect(find.text('Voici vos demandes assignées'), findsOneWidget);

    // Deux onglets seulement : ni Équipements, ni Factures, ni zones.
    expect(find.text('Accueil'), findsOneWidget);
    expect(find.text('Demandes'), findsOneWidget);
    expect(find.text('Équipements'), findsNothing);
    expect(find.text('Factures'), findsNothing);
    expect(find.text('Mes zones Wi-Fi'), findsNothing);
    expect(find.text('Ajouter une zone'), findsNothing);

    // L'accueil ne propose pas les actions du client.
    expect(find.text('Signaler une panne'), findsNothing);
    expect(find.text('Mes factures'), findsNothing);

    // Le technicien interroge l'API avec son propre identifiant.
    expect(
      adapter.calls.any((call) => call.contains('technicianId=tech-1')),
      isTrue,
      reason: 'liste restreinte aux demandes du technicien. Appels : ${adapter.calls}',
    );
  });

  testWidgets('technicien : KPI et liste de ses demandes assignées', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester);

    expect(find.text('#TK-2026-001'), findsOneWidget);
    expect(find.text('#TK-2026-002'), findsOneWidget);

    // Le client est l'interlocuteur affiché, pas la zone gérée.
    expect(find.textContaining('M. Kouassi'), findsWidgets);

    // Les KPI regroupent les statuts.
    expect(find.text('À traiter'), findsWidgets);
    expect(find.text('En cours'), findsWidgets);
    expect(find.text('Terminées'), findsWidgets);
  });

  testWidgets('technicien : filtre par groupe de statuts', (tester) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester);
    expect(find.text('#TK-2026-001'), findsOneWidget);

    // « Terminées » ne garde que la demande close.
    await tester.tap(find.text('Terminées').last);
    await settle(tester);
    expect(find.text('#TK-2026-001'), findsNothing);
    expect(find.text('#TK-2026-002'), findsOneWidget);

    // « À traiter » ne garde que les demandes pas encore prises en charge :
    // ici l'affectée est déjà en cours, donc le groupe est vide.
    await tester.tap(find.text('À traiter').last);
    await settle(tester);
    expect(find.text('#TK-2026-001'), findsNothing);
    expect(find.text('#TK-2026-002'), findsNothing);

    // « En cours » la retrouve.
    await tester.tap(find.text('En cours').last);
    await settle(tester);
    expect(find.text('#TK-2026-001'), findsOneWidget);
    expect(find.text('#TK-2026-002'), findsNothing);
  });

  testWidgets('technicien : une assignation reçue en direct s\'affiche', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));

    final controller = StreamController<Uint8List>();
    adapter.streams['/notifications/stream'] = controller.stream;

    // Le serveur ne connaît pas encore cette demande pour ce technicien.
    assigned = false;

    await pumpApp(tester);

    // Avant l'assignation : la demande n'est pas encore dans la liste du
    // technicien.
    expect(find.text('#TK-2026-002'), findsNothing);

    // Le serveur l'affecte, et sa notification part dans la foulée.
    assigned = true;

    // La régie affecte la demande. Le serveur écrit la notification, et le
    // technicien ne doit pas avoir à actualiser pour la voir.
    controller.add(
      Uint8List.fromList(
        utf8.encode(
          'event: notification\n'
          'data: ${jsonEncode({
                'id': 'n-assign',
                'type': 'TICKET_ASSIGNED',
                'title': 'Nouvelle intervention assignée',
                'body': '#TK-2026-002',
                'ticketId': 't-tech-2',
                'readAt': null,
                'createdAt': '2026-01-30T12:30:00.000Z',
              })}\n\n',
        ),
      ),
    );

    await settle(tester, steps: 20);

    await tester.tap(find.text('Demandes'));
    await settle(tester, steps: 20);

    // La demande assignée est là, sans qu'aucun rechargement manuel n'ait été
    // déclenché : c'est la notification qui a relics la liste.
    expect(find.text('#TK-2026-002'), findsOneWidget);

    await controller.close();
  });

  testWidgets('technicien : son portefeuille suit ses encaissements', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    // Le portefeuille est accessible depuis l'accueil, sans onglet : c'est le
    // premier chiffre que le technicien vient consulter.
    expect(find.text('Portefeuille'), findsOneWidget);
    // Le séparateur de milliers est posé par `intl` et varie selon la
    // plateforme : on vérifie le chiffre, pas sa ponctuation.
    expect(
      find.textContaining('55'),
      findsWidgets,
      reason: "l'accueil doit afficher le montant du mois courant",
    );

    await tester.tap(find.text('Portefeuille'));
    await settle(tester, steps: 20);

    expect(find.text('Mon portefeuille'), findsOneWidget);
    expect(find.text('Encaissé en février 2026'), findsOneWidget);
    expect(find.textContaining('70'), findsWidgets);
    // Deux mois de relevé, et chacun avec le nombre de règlements qu'il contient.
    expect(find.text('février 2026'), findsWidgets);
    expect(find.text('janvier 2026'), findsOneWidget);
    expect(find.text('2 règlements'), findsOneWidget);
    expect(find.text('1 règlement'), findsOneWidget);
    // Les moyens de paiement sont regroupés par canal, pas par opérateur :
    // le total ne distingue pas Wave d'Orange, et l'opérateur ne figure que
    // sur le règlement détaillé.
    expect(find.text('Mobile Money'), findsWidgets);
    expect(find.text('Espèces'), findsWidgets);
    // Le règlement Mobile Money nomme bien son opérateur. Il est en bas de
    // l'écran : sans défilement, son absence ne prouverait rien.
    // Les règlements sont sous le bas de l'écran : on fait glisser la liste
    // plutôt que de supposer une position.
    await tester.fling(find.text('Derniers règlements'), const Offset(0, -600), 1200);
    await settle(tester, steps: 20);
    // Le règlement Mobile Money nomme son opérateur, en toutes lettres : c'est
    // ce qui permet de rapprocher la transaction du paiement.
    expect(find.textContaining('Mobile Money Wave'), findsOneWidget);
    // Et chaque règlement renvoie vers l'intervention qu'il solde.
    expect(find.text('#TK-2026-001'), findsOneWidget);
  });

  testWidgets('technicien : un remboursement reste visible sans fausser le total', (
    tester,
  ) async {
    walletPayload = FakeApiData.walletWithRefund();
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Portefeuille'));
    await settle(tester, steps: 20);

    // Le remboursement n'est pas une recette : le cumul�� ne bouge pas, et une
    // ligne dédiée dit où est parti l'écart entre le total et les montants
    // affichés ligne à ligne.
    expect(find.textContaining('Dont'), findsOneWidget);
    expect(find.textContaining('remboursés'), findsOneWidget);

    // Le règlement repris reste dans l'historique, marqué comme tel. Le
    // retirer masquerait pourquoi le total ne correspond pas aux lignes.
    await tester.fling(find.text('Derniers règlements'), const Offset(0, -600), 1200);
    await settle(tester, steps: 20);
    expect(find.text('#TK-2026-001'), findsOneWidget);
    expect(find.textContaining('remboursé'), findsWidgets);
    // Le montant repris sort en négatif etet barré : aligné à droite, un
    // montant positif se lirait comme une recette de plus.
    expect(find.textContaining('-'), findsWidgets);
  });

  testWidgets('technicien : il déclare l\'encaissement en espèces', (
    tester,
  ) async {
    // Un devis accepté n'est pas encore encaissé : c'est précisément le cas
    // qui demandait ce bouton.
    hasQuote = true;
    quoteStatus = 'ACCEPTED';
    status = 'PENDING_QUOTE';
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    expect(find.textContaining('Encaisser'), findsOneWidget);

    await tester.tap(find.textContaining('Encaisser'));
    await settle(tester, steps: 20);

    // Sans confirmation, rien n'est déclaré : un encaissement est un fait, il
    // ne se produit pas sur un simple tap.
    expect(cashCalls, isEmpty);
    expect(find.text('Déclarer un encaissement'), findsOneWidget);

    await tester.tap(find.text("J'ai encaissé"));
    await settle(tester, steps: 20);

    expect(cashCalls, hasLength(1));
    expect(find.textContaining('Encaissement enregistré'), findsOneWidget);
  });

  testWidgets('technicien : un refus du serveur remonte tel quel', (
    tester,
  ) async {
    hasQuote = true;
    quoteStatus = 'ACCEPTED';
    status = 'PENDING_QUOTE';
    cashError = 'Ce devis ne vous est pas affecté';
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    await tester.tap(find.textContaining('Encaisser'));
    await settle(tester, steps: 20);
    await tester.tap(find.text("J'ai encaissé"));
    await settle(tester, steps: 20);

    // Le technicien voit pourquoi, et non un échec générique : il sait s'il
    // doit corriger sa demande ou réessayer.
    expect(find.textContaining('Ce devis ne vous est pas affecté'), findsOneWidget);
  });

  testWidgets('technicien : terminer exige un rapport d\'intervention', (
    tester,
  ) async {
    status = 'REPAIRING';
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    // La transition ne part pas d'un bouton : elle demande d'abord le compte
    // rendu, sans quoi une demande close ne laisserait aucune trace de ce qui a
    // ete fait chez le client.
    await tester.tap(find.text('Marquer comme terminée'));
    await settle(tester, steps: 20);

    expect(find.text('Rapport d\'intervention'), findsOneWidget);
    expect(adapter.calls.contains('PATCH /tickets/t-tech-1/status'), isFalse);

    // Un rapport vide n'est pas un rapport.
    await tester.tap(find.text('Enregistrer et terminer'));
    await settle(tester, steps: 20);
    expect(find.text('Ce qui a été constaté est obligatoire.'), findsOneWidget);

    await tester.enterText(
      find.byType(TextField).at(0),
      'Boitier hors tension, fusible saute',
    );
    await tester.enterText(
      find.byType(TextField).at(1),
      'Fusible remplace et alimentation retablie',
    );
    await settle(tester, steps: 20);

    await tester.tap(find.text('Enregistrer et terminer'));
    await settle(tester, steps: 20);

    // Le rapport est parti, puis la transition.
    expect(
      adapter.calls.contains('POST /tickets/t-tech-1/intervention'),
      isTrue,
    );
    expect(adapter.calls.contains('PATCH /tickets/t-tech-1/status'), isTrue);
  });

  testWidgets('technicien : le devis commande les actions possibles', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    // Sans devis, le technicien peut encore signaler une impossibilité.
    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester);
    expect(find.text('Signaler une impossibilité'), findsOneWidget);

    // Devis envoyé : le client en a connaissance et doit trancher. La
    // réparation disparaît des actions disponibles, et l'annulation avec elle.
    hasQuote = true;
    status = 'PENDING_QUOTE';
    await tester.pumpWidget(buildApp());
    await settle(tester, steps: 20);
    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    expect(find.text('Signaler une impossibilité'), findsNothing);
    expect(find.text('Passer en réparation'), findsNothing);
    expect(
      find.textContaining('attend la décision du client'),
      findsOneWidget,
      reason: 'le technicien doit comprendre pourquoi le bouton manque',
    );

    // Devis accepté : la réparation redevient possible.
    quoteStatus = 'ACCEPTED';
    await tester.pumpWidget(buildApp());
    await settle(tester, steps: 20);
    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    expect(find.text('Passer en réparation'), findsOneWidget);
    expect(find.text('Signaler une impossibilité'), findsNothing);
  });

  testWidgets('technicien : un devis payé ne bloque plus la réparation', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));

    // Le client a accepté puis réglé avant que le technicien n'ait fait avancer
    // la demande : elle est donc restée en devis en attente, avec un devis
    // payé. C'est cet état qui rendait la demande impossible à déplacer — le
    // bouton disparaissait et le serveur refusait la transition. Un paiement
    // vaut au moins autant qu'une acceptation : la réparation doit donc
    // redevenir possible.
    hasQuote = true;
    status = 'PENDING_QUOTE';
    quoteStatus = 'PAID';

    await pumpApp(tester);
    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    expect(find.text('Passer en réparation'), findsOneWidget);
    expect(
      find.textContaining('attend la décision du client'),
      findsNothing,
      reason: 'le devis est payé, le client n\'a plus rien à décider',
    );
  });

  testWidgets('technicien : le refus du devis rend la demande', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));

    // L'état est posé avant le premier chargement : l'application lit la
    // demande au démarrage, la muter ensuite ne relirait pas la base.
    hasQuote = true;
    quoteStatus = 'REJECTED';
    status = 'REPAIRING';

    await pumpApp(tester);
    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    // Un devis écarté ne lie plus personne : la demande est déjà en
    // réparation, le technicien peut la mener à son terme, corriger son devis
    // ou signaler une impossibilité.
    expect(find.text('Marquer comme terminée'), findsOneWidget);

    // Corriger son devis après un refus doit rester possible : le client a
    // écarté un montant, pas l'intervention. Sans cela, le refus laisserait la
    // demande sans aucune porte de sortie. Le libellé le dit : il ne s'agit
    // plus du premier devis, mais d'une nouvelle proposition.
    expect(find.text('Proposer un nouveau devis'), findsOneWidget);

    // Le bouton d'impossibilité est en bas de la carte d'action : il faut
    // descendre, sinon son absence ne prouverait rien.
    await tester.scrollUntilVisible(
      find.text('Signaler une impossibilité'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Signaler une impossibilité'), findsOneWidget);
  });

  testWidgets('technicien : faire avancer une demande depuis le détail', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester);

    expect(find.text('Intervention'), findsWidgets);
    expect(find.text('Client'), findsOneWidget);
    expect(find.text('Zone'), findsOneWidget);

    // Les transitions autorisées depuis AFFECTÉ sont proposées.
    expect(find.text('Démarrer le déplacement'), findsOneWidget);
    expect(find.text('Confirmer le rendez-vous'), findsOneWidget);

    await tester.tap(find.text('Démarrer le déplacement'));
    await settle(tester, steps: 24);

    expect(
      adapter.calls.contains('PATCH /tickets/t-tech-1/status'),
      isTrue,
      reason: 'le technicien doit faire avancer la demande',
    );
  });

  testWidgets(
    'technicien : le déplacement partage la position, puis le suivi s\'arrête',
    (tester) async {
      // Un point de départ est posté par Dart à partir de la dernière position
      // connue de l'appareil : il rend le suivi visible chez le client sans
      // attendre le premier point du GPS.
      installLocationPlatform(
        lastLocation: <String, dynamic>{
          'latitude': 5.3599,
          'longitude': -4.0086,
          'accuracy': 12.0,
        },
      );

      FlutterSecureStorage.setMockInitialValues(Map.of(_session));
      await pumpApp(tester);

      await tester.tap(find.text('Demandes'));
      await settle(tester);
      await tester.tap(find.text('#TK-2026-001'));
      await settle(tester);

      await tester.tap(find.text('Démarrer le déplacement'));
      await settle(tester, steps: 24);

      // Le point part après la transition : le serveur refuse un suivi sur une
      // demande qui n'est pas encore en route.
      expect(adapter.calls, contains('PATCH /tickets/t-tech-1/status'));
      expect(
        adapter.calls,
        contains('POST /tickets/t-tech-1/tracking'),
        reason: 'le départ doit être annoncé au client. Appels : ${adapter.calls}',
      );
      expect(
        adapter.calls.indexOf('POST /tickets/t-tech-1/tracking'),
        greaterThan(adapter.calls.indexOf('PATCH /tickets/t-tech-1/status')),
      );

      // Le technicien voit ce que le service transmet, distance comprise.
      expect(find.text('Suivi de position'), findsOneWidget);
      expect(find.text('Actif — position envoyée'), findsOneWidget);
      expect(find.text('840 m · environ 7 min'), findsOneWidget);

      // « Commencer le diagnostic » termine le déplacement : le suivi doit
      // s'arrêter, sinon le client verrait un technicien encore en route
      // pendant que le travail a commencé. Le bouton est sous la carte de
      // suivi, hors de l'écran.
      await tester.drag(find.byType(ListView), const Offset(0, -600));
      await settle(tester);
      await tester.tap(find.text('Commencer le diagnostic'));
      await settle(tester, steps: 24);

      expect(
        adapter.calls,
        contains('POST /tickets/t-tech-1/tracking/stop'),
        reason: 'le suivi doit être arrêté en sortant du déplacement',
      );
      expect(find.text('Suivi de position'), findsNothing);
    },
  );

  testWidgets('technicien : sans le service Android, le départ n\'est pas bloqué', (
    tester,
  ) async {
    // Plateforme absente (installée par `setUp`) : `start` lève
    // `MissingPluginException`. Il ne doit produire ni erreur bloquante, ni
    // demande de position sans coordonnées.
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester);

    await tester.tap(find.text('Démarrer le déplacement'));
    await settle(tester, steps: 24);

    expect(adapter.calls, contains('PATCH /tickets/t-tech-1/status'));
    expect(
      adapter.calls,
      isNot(contains('POST /tickets/t-tech-1/tracking')),
      reason: 'sans position connue, aucun point ne doit être inventé',
    );
    expect(tester.takeException(), isNull);
    expect(
      find.textContaining('Suivi de position indisponible'),
      findsWidgets,
      reason: 'le technicien doit comprendre pourquoi le client ne voit rien',
    );
  });

  testWidgets('technicien : profil sans zone, ouvert depuis l\'avatar', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.byTooltip('Mon profil'));
    await settle(tester);

    expect(find.text('Jean Dupont'), findsOneWidget);
    expect(find.text('Technicien'), findsWidgets);
    expect(find.text('Mon activité'), findsOneWidget);

    // Pas de zone Wi-Fi côté technicien.
    expect(find.text('Mes zones Wi-Fi'), findsNothing);
    expect(find.text('Aucune zone Wi-Fi associée à votre compte.'), findsNothing);

    // La barre de navigation reste visible, sur l'accueil.
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Demandes'), findsOneWidget);

    // Même version que celle du profil client : c'est le même APK.
    await tester.scrollUntilVisible(
      find.text('version 1.6.0 (7)'),
      150,
      scrollable: find.byType(Scrollable).last,
    );
    await settle(tester);
    expect(find.text('version 1.6.0 (7)'), findsOneWidget);
  });

  testWidgets('technicien : les avis reçus sont visibles, en lecture seule', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    await tester.tap(find.text('Avis'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('GET /evaluations'));
    expect(find.text('Avis reçus'), findsOneWidget);
    expect(find.text('Intervention rapide et soignée.'), findsOneWidget);
    expect(find.text('Retard sur le rendez-vous.'), findsOneWidget);

    // 5 et 2 : la moyenne affichée doit être 3,5, pas 3 (cumul entier).
    expect(find.text('3,5'), findsOneWidget);

    // Le technicien subit la note, il ne la rédige pas.
    expect(find.text('Mon avis'), findsNothing);
    expect(find.text('Déposer un avis'), findsNothing);
  });

  testWidgets('notifications : le technicien voit ses demandes assignées', (
    tester,
  ) async {
    await pumpApp(tester);

    await tester.enterText(find.byType(TextField).at(0), '0102030405');
    await settle(tester);
    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 20);

    expect(find.byType(NotificationBell), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(NotificationBell),
        matching: find.text('1'),
      ),
      findsOneWidget,
    );

    await tester.tap(find.byType(NotificationBell));
    await settle(tester, steps: 20);

    expect(find.text('Nouvelle intervention assignée'), findsOneWidget);
    expect(find.text('Tout lire'), findsOneWidget);

    // La notification mène au détail technicien, pas au détail client.
    await tester.tap(find.text('Nouvelle intervention assignée'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('PATCH /notifications/n-1'));
    expect(adapter.calls, isNot(contains('GET /home/tickets/t-tech-1')));
    expect(find.text('#TK-2026-001'), findsWidgets);
  });

  testWidgets('technicien : la disponibilité commande la répartition', (
    tester,
  ) async {
    await pumpApp(tester);
    await loginTechnician(tester);

    // Hors ligne, le circuit ne lui propose rien : l'écran doit le dire, sinon
    // « aucune demande » se lirait comme une panne qui n'existe pas.
    expect(find.text('Vous êtes hors ligne'), findsOneWidget);
    expect(
      find.text('Aucune demande ne vous sera proposée. Activez pour recevoir celles qui arrivent.'),
      findsOneWidget,
    );
    expect(find.text('1 demande vous est proposée'), findsNothing);

    expect(adapter.calls, contains('GET /technicians/offers'));

    await tester.tap(find.byType(Switch));
    await settle(tester, steps: 20);

    expect(
      adapter.calls,
      contains('POST /technicians/presence'),
      reason: 'la disponibilité est enregistrée par le serveur, pas seulement en local',
    );
    expect(find.text('Vous êtes en ligne'), findsOneWidget);

    // Se mettre en ligne relit la file dans la foulée : attendre le tic suivant
    // laisserait le technicien devant un écran vide pendant cinq secondes.
    expect(
      adapter.calls.where((call) => call == 'GET /technicians/offers').length,
      greaterThan(1),
    );

    await tester.tap(find.byType(Switch));
    await settle(tester, steps: 20);

    expect(find.text('Vous êtes hors ligne'), findsOneWidget);
    expect(online, isFalse);
  });

  testWidgets(
    'technicien : en ligne mais injoignable, l\'écran ne promet rien',
    (tester) async {
      online = true;
      minutesSinceSeen = 40;

      await pumpApp(tester);
      await loginTechnician(tester);

      // La disponibilité est une intention, pas une preuve : elle survit à un
      // téléphone déchargé. Un « vous êtes en ligne » ici ferait croire que des
      // demandes vont arriver alors que l'application ne parle plus au serveur.
      expect(find.text('En ligne, mais injoignable'), findsOneWidget);
      expect(
        find.text(
          'Votre application ne parle plus au serveur depuis un moment. '
          'Réouvrez-la pour recevoir les demandes.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('technicien : prendre la demande proposée l\'attribue', (
    tester,
  ) async {
    online = true;
    offers = [FakeApiData.offer(id: 'o-1')];

    await pumpApp(tester);
    await loginTechnician(tester);

    // Le bandeau ne s'affiche que s'il y a quelque chose à proposer : un
    // « 0 demande » en permanence ferait du vide une information.
    expect(find.text('1 demande vous est proposée'), findsOneWidget);

    await tester.tap(find.text('1 demande vous est proposée'));
    await settle(tester, steps: 20);

    expect(find.text('Demandes disponibles'), findsOneWidget);
    expect(find.text('En ligne'), findsOneWidget);

    // La file porte le contenu de la demande : c'est elle, et non la
    // référence seule, qui permet de décider.
    expect(find.text('#TK-2026-050'), findsOneWidget);
    expect(find.text('Connexion impossible'), findsOneWidget);
    expect(find.text('Mme Aya Traoré · WiFi Zone Cocody Riviera'), findsOneWidget);

    await tester.tap(find.text('#TK-2026-050'));
    await settle(tester, steps: 20);

    expect(find.text('Prendre cette demande'), findsOneWidget);
    expect(find.text('Refuser cette demande'), findsOneWidget);

    await tester.tap(find.text('Prendre cette demande'));
    await settle(tester, steps: 24);

    expect(adapter.calls, contains('POST /offers/o-1/accept'));

    // La demande prise ouvre son écran d'intervention, pas une feuille
    // refermée : la feuille n'a plus de contexte de navigation.
    expect(find.text('Intervention'), findsWidgets);
    expect(find.text('#TK-2026-050'), findsWidgets);
    expect(find.text('Prendre cette demande'), findsNothing);
    expect(offers, isEmpty);
  });

  testWidgets('technicien : refuser rend la demande aux autres', (
    tester,
  ) async {
    online = true;
    offers = [
      FakeApiData.offer(id: 'o-1'),
      FakeApiData.offer(
        id: 'o-2',
        ticketId: 't-offer-2',
        reference: '#TK-2026-051',
      ),
    ];

    await pumpApp(tester);
    await loginTechnician(tester);

    expect(find.text('2 demandes vous sont proposées'), findsOneWidget);

    await tester.tap(find.text('2 demandes vous sont proposées'));
    await settle(tester, steps: 20);

    await tester.tap(find.text('#TK-2026-050'));
    await settle(tester, steps: 20);

    // Le refus n'est pas un geste anodin : la demande part chez les autres.
    await tester.tap(find.text('Refuser cette demande'));
    await settle(tester, steps: 20);

    expect(find.text('Refuser cette demande ?'), findsOneWidget);
    expect(
      find.text(
        'Elle sera proposée aux autres techniciens en ligne. Vous ne la verrez plus.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.widgetWithText(FilledButton, 'Refuser'));
    // La bannière est éphémère : la boucle de répartition la remplace à son
    // prochain passage, cinq secondes plus tard. Elle est donc relue tout de
    // suite, avant que la cadence ne soit atteinte.
    await settle(tester, steps: 8);

    expect(adapter.calls, contains('POST /offers/o-1/decline'));

    // Elle disparaît pour lui, et l'autre reste : refuser n'est pas quitter la
    // file.
    expect(find.text('#TK-2026-050'), findsNothing);
    expect(find.text('#TK-2026-051'), findsOneWidget);
    expect(
      find.text('Demande refusée. Elle est proposée aux autres techniciens.'),
      findsOneWidget,
    );
  });

  testWidgets('technicien : une demande déjà prise disparaît de la file', (
    tester,
  ) async {
    online = true;
    offers = [FakeApiData.offer(id: 'o-1')];
    acceptError = 'Cette demande a déjà été prise par un autre technicien.';

    await pumpApp(tester);
    await loginTechnician(tester);

    await tester.tap(find.text('1 demande vous est proposée'));
    await settle(tester, steps: 20);

    await tester.tap(find.text('#TK-2026-050'));
    await settle(tester, steps: 20);

    await tester.tap(find.text('Prendre cette demande'));
    // Motif éphémère : relu avant le passage suivant de la boucle de
    // répartition, qui viendrait l'effacer.
    await settle(tester, steps: 8);

    // Le motif est montré tel quel : c'est lui qui explique pourquoi la
    // proposition n'aboutit pas, et une formule générique ferait croire à un
    // réseau coupé.
    expect(
      find.text('Cette demande a déjà été prise par un autre technicien.'),
      findsOneWidget,
    );

    // La feuille reste ouverte : la fermer ferait disparaître le motif, qui
    // serait affiché sur l'écran d'à côté, sous la barrière.
    expect(find.text('Prendre cette demande'), findsOneWidget);
  });

  testWidgets('technicien : hors ligne, l\'écran des offres le dit', (
    tester,
  ) async {
    offers = [FakeApiData.offer(id: 'o-1')];

    await pumpApp(tester);
    await loginTechnician(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester, steps: 20);

    // Sans availability, il n'y a pas de bandeau d'entrée : la liste des offres
    // s'ouvre par le push, ou une fois en ligne.
    expect(find.text('1 demande vous est proposée'), findsNothing);
    expect(
      find.text(
        'Vous êtes hors ligne : aucune demande ne vous est proposée. '
        'Mettez-vous en ligne depuis l’accueil.',
      ),
      findsNothing,
      reason: 'l\'écran des offres n\'est pas atteint depuis les onglets du technicien',
    );
  });

  testWidgets('technicien : une demande impossible à faire revient dans le circuit', (
    tester,
  ) async {
    await pumpApp(tester);
    await loginTechnician(tester);

    await tester.tap(find.text('Demandes'));
    await settle(tester, steps: 20);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    // Tant qu'il n'est pas parti, la demande peut revenir dans le circuit.
    // Annuler, lui, la supprimerait pour le client.
    await tester.scrollUntilVisible(
      find.text('Remettre à un autre technicien'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await settle(tester);

    await tester.tap(find.text('Remettre à un autre technicien'));
    await settle(tester, steps: 20);

    expect(find.text('Remettre dans la file ?'), findsOneWidget);
    expect(
      find.text(
        '#TK-2026-001 sera proposée aux autres techniciens en ligne. '
        'Elle n\'est pas annulée : le client reste en attente d\'un technicien.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.widgetWithText(FilledButton, 'Remettre'));
    await settle(tester, steps: 24);

    expect(adapter.calls, contains('POST /tickets/t-tech-1/release'));

    // Le suivi est arrêté : le trajet ne porte plus sur rien, et le client ne
    // doit pas voir une ETA pour un technicien qui n'est plus attendu.
    expect(adapter.calls, contains('POST /tickets/t-tech-1/tracking/stop'));

    // L'écran ne propose plus rien sur une demande qui n'est plus la sienne.
    expect(find.text('Demande remise dans la file'), findsOneWidget);
    expect(
      find.text(
        'Elle est proposée aux autres techniciens en ligne. Elle n\'est pas '
        'annulée : le client reste en attente d\'un technicien.',
      ),
      findsOneWidget,
    );
    expect(find.text('Signaler une impossibilité'), findsNothing);
    expect(find.text('Prendre en charge'), findsNothing);

    await tester.tap(find.text('Retour à mes demandes'));
    await settle(tester, steps: 20);

    // Elle n'est plus à lui : elle a disparu de sa liste.
    expect(find.text('#TK-2026-001'), findsNothing);
  });

  testWidgets('technicien : la notification d\'une offre ouvre la file', (
    tester,
  ) async {
    online = true;
    offers = [FakeApiData.offer(id: 'o-1')];

    // La session est déjà restaurée : c'est le cas réel d'un technicien qui
    // tapait sur la notification, application fermée.
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));

    await pumpApp(tester, push: FakePushService(offerId: 'o-1'));
    await settle(tester, steps: 20);

    await resumeApp(tester);

    expect(find.text('Demandes disponibles'), findsOneWidget);

    // La proposition nommée par la notification s'ouvre d'elle-même : la file
    // la porte, et c'est elle qui décide.
    expect(find.text('Prendre cette demande'), findsOneWidget);
    expect(find.text('#TK-2026-050'), findsWidgets);
  });
}
