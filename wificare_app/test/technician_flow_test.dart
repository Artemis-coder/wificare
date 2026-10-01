import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wificare_app/src/app.dart';
import 'package:wificare_app/src/core/network/api_client.dart';
import 'package:wificare_app/src/core/providers/infra_providers.dart';
import 'package:wificare_app/src/core/storage/token_storage.dart';
import 'package:wificare_app/src/core/widgets/notification_bell.dart';

import 'fake_api.dart';

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

  setUp(() {
    notifications = _seedNotifications();
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
          'ASSIGNED',
          technicianId: 'tech-1',
        ),
      },
      '/tickets/t-tech-1/status': (path, body) {
        final status = (body as Map)['status'] as String;
        return {
          'data': FakeApiData.ticket(
            't-tech-1',
            '#TK-2026-001',
            status,
            technicianId: 'tech-1',
          ),
        };
      },
      '/tickets': (path, body) => FakeApiData.ticketPage([
        FakeApiData.ticket(
          't-tech-1',
          '#TK-2026-001',
          'ASSIGNED',
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

  Widget buildApp() {
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