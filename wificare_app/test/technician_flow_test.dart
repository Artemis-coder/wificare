import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wificare_app/src/app.dart';
import 'package:wificare_app/src/core/network/api_client.dart';
import 'package:wificare_app/src/core/providers/infra_providers.dart';
import 'package:wificare_app/src/core/storage/token_storage.dart';
import 'package:wificare_app/src/core/widgets/notification_bell.dart';

import 'fake_api.dart';

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

  setUp(() {
    status = 'ASSIGNED';
    notifications = _seedNotifications();

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
          status,
          technicianId: 'tech-1',
          // Un devis envoyé retire l'annulation au technicien : le client en a
          // connaissance et doit trancher.
          quoteInvoice: hasQuote
              ? FakeApiData.quote(ticketId: 't-tech-1', status: quoteStatus)
              : null,
        ),
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
      '/tickets/t-tech-1/tracking/stop': (_, _) => {
        'data': {'stoppedAt': '2026-01-30T10:20:00.000Z'},
      },
      '/tickets': (path, body) => FakeApiData.ticketPage([
        FakeApiData.ticket(
          't-tech-1',
          '#TK-2026-001',
          status,
          technicianId: 'tech-1',
        ),
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
  Widget buildApp({bool onboardingSeen = true}) {
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
      ],
      child: const WiFiCareApp(),
    );
  }

  Future<void> settle(WidgetTester tester, {int steps = 12}) async {
    for (var i = 0; i < steps; i++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
  }

  Future<void> pumpApp(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1280, 2856);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(buildApp());
    await settle(tester);
  }

  testWidgets('connexion technicien : accueil dédié, sans zones ni factures', (
    tester,
  ) async {
    await pumpApp(tester);

    await tester.enterText(find.byType(TextField).at(0), '2250102030405');
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
    // demande sans aucune porte de sortie.
    expect(find.text('Envoyer un devis au client'), findsOneWidget);

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

    await tester.enterText(find.byType(TextField).at(0), '2250102030405');
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
}