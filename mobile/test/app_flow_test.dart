import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:wificare_app/src/app.dart';
import 'package:wificare_app/src/core/router/app_router.dart';
import 'package:wificare_app/src/features/tickets/presentation/ticket_new_screen.dart';
import 'package:wificare_app/src/core/network/api_client.dart';
import 'package:wificare_app/src/core/providers/infra_providers.dart';
import 'package:wificare_app/src/core/storage/token_storage.dart';
import 'package:wificare_app/src/core/widgets/notification_bell.dart';
import 'package:wificare_app/src/core/widgets/states.dart';

import 'fake_api.dart';

/// Jeton injecté dans le stockage simulé pour simuler une session ouverte.
const Map<String, String> _session = {
  'accessToken': 'access-1',
  'refreshToken': 'refresh-1',
};

/// Notifications simulées.
///
/// Elles sont mutées par les appels de marquage, comme le ferait la base : sans
/// cela le badge se repeuplerait à chaque relecture et « Tout lire » ne viderait
/// jamais le compteur.
List<Map<String, dynamic>> _seedNotifications() => [
  FakeApiData.notification(
    'n-1',
    'TICKET_ASSIGNED',
    'Demande transmise au technicien',
    '#TK-2026-001 a été transmise à Jean Dupont.',
    ticketId: 't-1',
  ),
  FakeApiData.notification(
    'n-2',
    'TICKET_STATUS_CHANGED',
    '#TK-2026-002 : Clôturée',
    'Votre demande est maintenant Clôturée.',
    ticketId: 't-2',
    read: true,
  ),
];

/// Facture de démonstration, partagée par la liste et le détail.
///
/// Le détail recharge la facture par son identifiant : sans cette route dans
/// l'API simulée, l'écran afficherait son titre de repli au lieu de « Facture ».
final Map<String, dynamic> _invoice = {
  'id': 'inv-1',
  'ticketId': 't-2',
  'type': 'INVOICE',
  'status': 'PAID',
  'totalAmount': 15000,
  'createdAt': '2026-01-30T10:00:00.000Z',
  'lines': [
    {
      'id': 'line-1',
      'quoteInvoiceId': 'inv-1',
      'description': 'Remplacement de l\'ONT',
      'quantity': 1,
      'unitPrice': 15000,
      'totalPrice': 15000,
    },
  ],
  'payment': {
    'id': 'pay-1',
    'quoteInvoiceId': 'inv-1',
    'amount': 15000,
    'channel': 'MOBILE_MONEY',
    'reference': 'TRX-1',
    'proofUrl': null,
    'status': 'COMPLETED',
    'createdAt': '2026-01-30T10:00:00.000Z',
  },
  'ticket': FakeApiData.ticket('t-2', '#TK-2026-002', 'COMPLETED'),
};

void _markRead(List<Map<String, dynamic>> items, String id) {
  for (final item in items) {
    if (item['id'] == id) item['readAt'] = '2026-01-30T12:00:00.000Z';
  }
}

Map<String, dynamic> _notificationById(
  List<Map<String, dynamic>> items,
  String id,
) => items.firstWhere((item) => item['id'] == id);

/// Demande dont le technicien a arrêté de partager sa position : le suivi est
/// inactif, donc le serveur n'a plus d'ETA à rendre. Elle sert au test de la
/// relance, qui n'a aucun chiffre à afficher mais un bouton à proposer.
final Map<String, dynamic> _perduTicket = FakeApiData.ticket(
  't-perdu',
  '#TK-2026-011',
  'EN_ROUTE',
  technicianId: 'tech-1',
  tracking: FakeApiData.tracking(active: false, etaMinutes: null),
);

/// Parcours client vérifié de bout en bout contre une API simulée :
/// connexion, redirection, onglets, liste des pannes, création d'une demande.
void main() {
  late FakeHttpAdapter adapter;
  late List<Map<String, dynamic>> notifications;
  int loginStatus = 200;
  String? loginError;

  setUp(() {
    notifications = _seedNotifications();
    loginStatus = 200;
    loginError = null;
    FlutterSecureStorage.setMockInitialValues({});

    // Version du paquet installé : un test widget n'a pas de plateforme, et la
    // version affichée doit venir d'elle — c'est tout l'intérêt d'avoir supprimé
    // le `1.0.0` écrit à la main.
    PackageInfo.setMockInitialValues(
      appName: 'WiFi Care',
      packageName: 'ci.wificare.app',
      version: '1.6.0',
      buildNumber: '7',
      buildSignature: '',
    );

    adapter = FakeHttpAdapter({
      '/auth/login': (_, _) => loginStatus == 403
          ? {'error': loginError ?? 'Ce compte n\'est pas un compte technicien.'}
          : {
              'data': {
                'user': FakeApiData.user,
                'tokens': {
                  'accessToken': 'access-1',
                  'refreshToken': 'refresh-1',
                },
              },
            },
      '/auth/me': (_, _) => {
        'data': {'user': FakeApiData.user, 'client': FakeApiData.client},
      },
      '/auth/refresh': (_, _) => {
        'data': {'accessToken': 'access-2', 'refreshToken': 'refresh-2'},
      },
      '/auth/logout': (_, _) => {
        'data': {'message': 'Déconnexion réussie'},
      },
      '/tickets/t-1': (_, _) => {
        'data': FakeApiData.ticket('t-1', '#TK-2026-001', 'DIAGNOSING'),
      },
      '/tickets/t-2': (_, _) => {
        'data': FakeApiData.ticket('t-2', '#TK-2026-002', 'COMPLETED'),
      },
      // Demande en cours de trajet, technicien en route : l'ETA est calculable.
      '/tickets/t-enroute': (_, _) => {
        'data': FakeApiData.ticket(
          't-enroute',
          '#TK-2026-010',
          'EN_ROUTE',
          technicianId: 'tech-1',
          tracking: FakeApiData.tracking(),
        ),
      },
      // Demande dont le technicien a arrêté de partager sa position : plus
      // d'ETA, et le client doit pouvoir le relancer.
      // Demande dont le technicien a envoyé un devis : le client doit voir
      // l'étape « Devis en attente » dans le suivi.
      '/tickets/t-3': (_, _) => {
        'data': FakeApiData.ticket(
          't-3',
          '#TK-2026-003',
          'PENDING_QUOTE',
          quoteInvoice: FakeApiData.quote(),
        ),
      },
      '/tickets': (path, body) {
        if (path.startsWith('/tickets?') && path.contains('status=')) {
          return FakeApiData.ticketPage([
            FakeApiData.ticket('t-2', '#TK-2026-002', 'COMPLETED'),
          ]);
        }
        if (body is Map && body['wifiZoneId'] != null) {
          return {'data': FakeApiData.ticket('t-new', '#TK-2026-009', 'NEW')};
        }
        return FakeApiData.ticketPage([
          FakeApiData.ticket('t-1', '#TK-2026-001', 'DIAGNOSING'),
          FakeApiData.ticket(
            't-enroute',
            '#TK-2026-010',
            'EN_ROUTE',
            technicianId: 'tech-1',
            tracking: FakeApiData.tracking(),
          ),
          FakeApiData.ticket('t-2', '#TK-2026-002', 'COMPLETED'),
          FakeApiData.ticket(
            't-3',
            '#TK-2026-003',
            'PENDING_QUOTE',
            quoteInvoice: FakeApiData.quote(),
          ),
        ]);
      },
      '/notifications': (_, _) => FakeApiData.notificationFeed(notifications),
      'PATCH /notifications': (_, _) {
        for (final item in notifications) {
          item['readAt'] = '2026-01-30T12:00:00.000Z';
        }
        return {'data': {'markedAsRead': notifications.length}};
      },
      'DELETE /notifications/n-1': (_, _) {
        // Le serveur refuse une notification encore non lue : le test le
        // vérifie en amont du balayage, pas seulement l'absence d'erreur.
        final target = notifications.firstWhere((n) => n['id'] == 'n-1');
        if (target['readAt'] == null) {
          adapter.statuses['DELETE /notifications/n-1'] = 409;
          return {'error': 'Marquez la notification comme lue avant de la supprimer'};
        }

        notifications.removeWhere((n) => n['id'] == 'n-1');
        return {'data': {'id': 'n-1'}};
      },
      '/notifications/n-1': (_, _) {
        _markRead(notifications, 'n-1');
        return {'data': _notificationById(notifications, 'n-1')};
      },
      '/quote-invoices': (_, _) => {
        'data': [_invoice],
      },
      '/quote-invoices/inv-1': (_, _) => {
        'data': _invoice,
      },
      '/auth/register': (_, body) => {
        'data': {
          'user': FakeApiData.user,
          'tokens': {'accessToken': 'access-1', 'refreshToken': 'refresh-1'},
          'echo': body,
        },
      },
      '/wifi-zones': (path, body) {
        if (body is Map && body['name'] != null) {
          return {
            'data': {
              'id': 'zone-2',
              'clientId': 'client-1',
              'name': body['name'],
              'location': body['location'] ?? '',
              'equipments': <dynamic>[],
            },
          };
        }
        return {'data': [FakeApiData.zone]};
      },
      '/wifi-zones/zone-1/equipments': (_, _) => {
        'data': FakeApiData.zone['equipments'],
      },
    });

    // Le flux temps réel reste silencieux par défaut : les tests qui s'y
    // intéressent branchent leur propre flux.
    adapter.streams['/notifications/stream'] = const Stream<Uint8List>.empty();
  });

  /// Construit l'application.
  ///
  /// [onboardingSeen] vaut `true` par défaut : ces tests portent sur les
  /// parcours, pas sur les autorisations, et l'écran d'accueil les en
  /// détournerait tous. Le test qui le vérifie le passe à `false`.
  Widget buildApp({bool onboardingSeen = true}) {
    final dio = Dio();
    dio.httpClientAdapter = adapter;
    final refreshDio = Dio()..httpClientAdapter = adapter;
    final storage = TokenStorage();

    return ProviderScope(
      overrides: [
        apiClientProvider.overrideWith(
          (ref) => ApiClient(tokenStorage: storage, dio: dio, refreshDio: refreshDio),
        ),
        onboardingSeenProvider.overrideWithValue(onboardingSeen),
      ],
      child: const WiFiCareApp(),
    );
  }

  /// Fait avancer le temps de rendu par pas discrets : `pumpAndSettle` ne
  /// termine jamais sur un écran qui affiche un `CircularProgressIndicator`.
  Future<void> settle(WidgetTester tester, {int steps = 12}) async {
    for (var i = 0; i < steps; i++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
  }

  Future<void> pumpApp(WidgetTester tester, {bool onboardingSeen = true}) async {
    // Format proche d'un téléphone réel pour que la mise en page soit représentative.
    tester.view.physicalSize = const Size(1280, 2856);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(buildApp(onboardingSeen: onboardingSeen));
    await settle(tester);
  }

  testWidgets('connexion par mot de passe puis tableau de bord', (tester) async {
    await pumpApp(tester);

    expect(find.text('Se connecter'), findsOneWidget);
    expect(find.text('Type de compte'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), '0707070707');
    await settle(tester);
    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);

    // Saisir les deux champs ne connecte pas : il faut une action explicite.
    expect(adapter.calls, isNot(contains('POST /auth/login')));
    expect(find.text('Bonjour Kouassi Marc'), findsNothing);

    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 20);

    expect(find.text('Se connecter'), findsNothing);
    expect(find.text('Bonjour Kouassi Marc'), findsOneWidget);
    expect(adapter.calls, contains('POST /auth/login'));
    expect(adapter.calls, contains('GET /auth/me'));
  });

  testWidgets('connexion : la touche « Terminé » du clavier connecte', (
    tester,
  ) async {
    await pumpApp(tester);

    await tester.enterText(find.byType(TextField).at(0), '0707070707');
    await settle(tester);
    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('POST /auth/login'));
    expect(find.text('Bonjour Kouassi Marc'), findsOneWidget);
  });

  testWidgets('connexion : toast et champ en erreur', (tester) async {
    await pumpApp(tester);

    // Numéro vide : message éphémère + champ téléphone signalé. Le texte vient
    // de l'outil de numérotation, pas de l'écran : un seul message doit dire
    // « ce numéro n'est pas valide ».
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 3);
    // Message éphémère (toast) + erreur affichée sous le champ téléphone.
    expect(find.text('Saisissez votre numéro de téléphone.'), findsNWidgets(2));

    await tester.enterText(find.byType(TextField).at(0), '0707070707');
    await settle(tester);

    // Mot de passe incomplet.
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 3);
    expect(find.text('Le mot de passe comporte 4 chiffres.'), findsOneWidget);
    expect(find.textContaining('Se connecter'), findsWidgets);
  });

  testWidgets('connexion : le pays choisi commande le plan de numérotation', (
    tester,
  ) async {
    await pumpApp(tester);

    // Le champ annonce le plan du pays sélectionné : dix chiffres, exemple
    // ivoirien.
    expect(find.textContaining('10 chiffres'), findsOneWidget);

    await tester.tap(find.textContaining('+225'));
    await settle(tester, steps: 3);

    // La liste est cherchable : « sen » mène au Sénégal sans faire défiler
    // 245 pays.
    await tester.enterText(
      find.widgetWithIcon(TextField, Icons.search_rounded),
      'sen',
    );
    await settle(tester);
    await tester.tap(find.text('Sénégal').last);
    await settle(tester, steps: 3);

    expect(find.textContaining('9 chiffres'), findsOneWidget);

    // Le champ limite la saisie au plan sénégalais : un numéro ivoirien tapé
    // sous le mauvais drapeau est tronqué, sans être refusé — les plans mobiles
    // sont plus étroits que les numéros réellement en circulation, et refuser
    // sur cette base ferait perdre l'accès à des comptes existants.
    await tester.enterText(find.byType(TextField).at(0), '0707070707');
    await settle(tester);
    expect(
      tester.widget<TextField>(find.byType(TextField).at(0)).controller!.text,
      '070707070',
    );

    await tester.enterText(find.byType(TextField).at(0), '701234567');
    await settle(tester);
    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('POST /auth/login'));
  });

  testWidgets('connexion : rester connecté est proposé, décoché par défaut', (
    tester,
  ) async {
    await pumpApp(tester);

    final checkbox = find.byType(Checkbox);
    expect(checkbox, findsOneWidget);
    expect(tester.widget<Checkbox>(checkbox).value, isFalse);

    await tester.tap(checkbox);
    await settle(tester);
    expect(tester.widget<Checkbox>(find.byType(Checkbox)).value, isTrue);
  });

  testWidgets('connexion : un type de compte incohérent cible le sélecteur', (
    tester,
  ) async {
    loginStatus = 403;
    loginError = "Ce compte n'est pas un compte propriétaire de zone.";
    await pumpApp(tester);
    adapter.statuses['/auth/login'] = 403;

    await tester.enterText(find.byType(TextField).at(0), '0102030405');
    await settle(tester);
    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 5);

    // Le message est rattaché au sélecteur de type, pas au mot de passe :
    // le rendre visible sous le champ mot de passe ferait croire à un mot de
    // passe erroné.
    expect(find.byType(ErrorBanner), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(ErrorBanner),
        matching: find.text("Ce compte n'est pas un compte propriétaire de zone."),
      ),
      findsOneWidget,
    );

    // Changer de type de compte efface le message.
    await tester.tap(find.text('Technicien'));
    await settle(tester, steps: 5);

    expect(find.byType(ErrorBanner), findsNothing);
  });

  testWidgets('session restaurée au démarrage', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);

    await pumpApp(tester);

    expect(find.text('Se connecter'), findsNothing);
    expect(find.text('Accueil'), findsWidgets);
  });

  testWidgets('liste des pannes : contenu et filtre par statut', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.text('Pannes'));
    await settle(tester);

    // Indicateurs : total, en cours, traitées.
    expect(find.text('Signalées'), findsOneWidget);
    expect(find.text('En cours'), findsOneWidget);
    expect(find.text('Traitées'), findsOneWidget);

    expect(find.text('#TK-2026-001'), findsOneWidget);
    expect(find.text('#TK-2026-002'), findsOneWidget);
    expect(find.text('En diagnostic'), findsWidgets);
    expect(find.text('Terminé'), findsWidgets);
  });

  testWidgets('suivi : le devis envoyé apparaît dans la liste d\'étapes', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.text('Pannes'));
    await settle(tester);

    // Demande sans devis : l'étape ne doit pas promettre un devis à venir.
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester);

    expect(find.text('Suivi de l\'intervention'), findsOneWidget);
    expect(
      find.text('Devis en attente'),
      findsNothing,
      reason: 'un devis est facultatif : ne pas l\'annoncer s\'il n\'existe pas',
    );

    await tester.pageBack();
    await settle(tester);

    // Demande pour laquelle le technicien a envoyé un devis : l'étape doit
    // figurer, et porter la mention « En cours ».
    await tester.scrollUntilVisible(
      find.text('#TK-2026-003'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('#TK-2026-003'));
    await settle(tester);

    // Le libellé apparaît deux fois : dans le statut de la demande et dans
    // l'étape du suivi, ce qui est précisément ce qui manquait.
    expect(find.text('Devis en attente'), findsWidgets);
    expect(find.text('En cours'), findsWidgets);
  });

  testWidgets('factures : montant et statut de paiement', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.text('Factures'));
    await settle(tester);

    expect(find.textContaining('15'), findsWidgets);
    expect(find.text('Payé'), findsWidgets);
  });

  testWidgets('création d\'une demande : validation puis envoi', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.text('Pannes'));
    await settle(tester);
    await tester.tap(find.byIcon(Icons.add_circle_rounded));
    await settle(tester);

    expect(find.text('Nouvelle demande'), findsOneWidget);

    // Zone et type sont dans les deux premières cartes, visibles sans défiler.
    await tester.tap(find.text('WiFi Zone Angre 8e Tranche'));
    await settle(tester);

    // Chaque type propose un libellé et une description, sans troncature.
    expect(find.text('Plus aucun accès à Internet'), findsOneWidget);
    expect(find.text('Connexion coupée ou très lente'), findsOneWidget);
    expect(
      find.text('Nouvelle installation'),
      findsOneWidget,
    );

    await tester.tap(find.text('Panne totale'));
    await settle(tester);

    // L'option retenue est signalée par la radio cochée.
    expect(
      find.descendant(
        of: find.ancestor(
          of: find.text('Plus aucun accès à Internet'),
          matching: find.byType(InkWell),
        ),
        matching: find.byIcon(Icons.radio_button_checked_rounded),
      ),
      findsOneWidget,
    );

    // Le bouton d'envoi est en bas du formulaire.
    final form = find.descendant(
      of: find.byType(TicketNewScreen),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.text('Envoyer la demande'),
      150,
      scrollable: form.first,
    );
    await settle(tester);
    await tester.tap(find.text('Envoyer la demande'));
    await settle(tester, steps: 20);

    expect(
      adapter.calls.contains('POST /tickets'),
      isTrue,
      reason: 'la demande doit être envoyée à l\'API',
    );
  }, timeout: const Timeout(Duration(seconds: 60)));

  testWidgets('zone en attente : équipements oui, demande non', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);

    // Le dossier client comporte une zone validée et une zone encore en attente.
    adapter.routes['/auth/me'] = (_, _) => {
      'data': {
        'user': FakeApiData.user,
        'client': FakeApiData.clientWithPendingZone,
      },
    };
    adapter.routes['/wifi-zones'] = (path, body) {
      if (body is Map && body['name'] != null) {
        return {'data': FakeApiData.pendingZone};
      }
      return {
        'data': [
          FakeApiData.zone,
          FakeApiData.pendingZone,
        ],
      };
    };

    await pumpApp(tester);

    // Les équipements restent déclarables sur une zone non validée.
    await tester.tap(find.text('Équipements'));
    await settle(tester);

    // Les zones sont dans un carrousel horizontal : la seconde est hors cadre.
    final zoneCarousel = find
        .ancestor(
          of: find.text('WiFi Zone Angre 8e Tranche'),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.text('WiFi Zone Riviera 2'),
      120,
      scrollable: zoneCarousel,
    );
    await settle(tester);
    await tester.tap(find.text('WiFi Zone Riviera 2'));
    await settle(tester);

    expect(find.text('En attente de validation'), findsOneWidget);
    expect(
      find.textContaining('Vous pouvez déclarer vos équipements.'),
      findsOneWidget,
    );

    // La zone validée reste sélectionnable sur le formulaire de demande.
    await tester.tap(find.text('Pannes'));
    await settle(tester);
    await tester.tap(find.byIcon(Icons.add_circle_rounded));
    await settle(tester);

    expect(find.text('WiFi Zone Angre 8e Tranche'), findsOneWidget);
    expect(
      find.text('WiFi Zone Riviera 2'),
      findsNothing,
      reason: 'une zone non validée ne peut pas recevoir de demande',
    );
  }, timeout: const Timeout(Duration(seconds: 60)));

  testWidgets('profil : zones du client et déconnexion', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    // Le profil n'est plus un onglet : on y accède depuis l'avatar de l'accueil.
    await tester.tap(find.byTooltip('Mon profil'));
    await settle(tester);

    expect(find.text('Kouassi Marc'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('WiFi Zone Angre 8e Tranche'),
      150,
      scrollable: find.byType(Scrollable).last,
    );
    await settle(tester);
    expect(find.text('WiFi Zone Angre 8e Tranche'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Se déconnecter'),
      150,
      scrollable: find.byType(Scrollable).last,
    );
    await settle(tester);
    expect(find.text('Se déconnecter'), findsOneWidget);

    // La version vient du paquet installé. Elle est ce que l'utilisateur annonce
    // quand une notification ne se déclenche pas, et ce qui permet de dire quel
    // APK il tourne : un numéro écrit dans le code resterait faux en silence.
    expect(find.text('version 1.6.0 (7)'), findsOneWidget);
  });

  testWidgets('la version de l\'application est lisible avant la connexion', (
    tester,
  ) async {
    await pumpApp(tester);

    // Elle est sur l'écran de connexion parce que c'est le seul endroit visible
    // sans compte : c'est là qu'on regarde quand l'application fait un truc
    // bizarre.
    expect(find.textContaining('version 1.6.0 (7)'), findsOneWidget);
    expect(
      find.textContaining('1.0.0'),
      findsNothing,
      reason: 'aucun numéro de version ne doit être écrit en dur',
    );
  });
  testWidgets('déconnexion : deux boutons côte à côte', (tester) async {
    // Copie mutable : la déconnexion réelle vide le stockage simulé.
    FlutterSecureStorage.setMockInitialValues(Map.of(_session));
    await pumpApp(tester);

    // Le profil n'est plus un onglet : on y accède depuis l'avatar de l'accueil.
    await tester.tap(find.byTooltip('Mon profil'));
    await settle(tester);

    await tester.scrollUntilVisible(
      find.text('Se déconnecter'),
      150,
      scrollable: find.byType(Scrollable).last,
    );
    await settle(tester);
    await tester.tap(find.text('Se déconnecter'));
    await settle(tester, steps: 4);

    expect(find.text('Non'), findsOneWidget);
    expect(find.text('Oui'), findsOneWidget);

    // Les deux actions partagent la même rangée, de largeur égale.
    final actions = find.ancestor(
      of: find.text('Non'),
      matching: find.byType(Row),
    );
    expect(actions, findsWidgets);
    expect(
      find.descendant(of: actions.first, matching: find.text('Oui')),
      findsOneWidget,
      reason: '« Oui » doit être à côté de « Non »',
    );

    // « Annuler » ferme le dialogue sans sortir du compte.
    await tester.tap(find.text('Non'));
    await settle(tester, steps: 4);
    expect(find.text('Non'), findsNothing);
    // Le profil est toujours affiché : l'utilisateur n'a pas été déconnecté.
    expect(find.text('Se déconnecter'), findsOneWidget);
    expect(adapter.calls.contains('POST /auth/logout'), isFalse);

    // Cette fois on confirme.
    await tester.tap(find.text('Se déconnecter'));
    await settle(tester, steps: 4);
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(FilledButton, 'Oui'),
      ),
    );
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('POST /auth/logout'));
    expect(find.text('Type de compte'), findsOneWidget);
  });

  testWidgets('profil : hors de la barre de navigation, ouvert depuis l\'avatar', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    // Le profil n'est pas un onglet : la barre contient exactement les onglets
    // déclarés, et aucun ne s'appelle « Profil ». Compter une valeur fixe
    // casserait à chaque ajout d'onglet sans dire ce que l'on protège.
    final menu = find.byType(NavigationBar);
    expect(menu, findsOneWidget);
    expect(find.text('Profil'), findsNothing);
    expect(
      tester.widget<NavigationBar>(menu).destinations.length,
      ClientTab.tabs.length,
      reason: 'le profil ne doit plus être un onglet',
    );

    // L'avatar de l'accueil ouvre le profil.
    await tester.tap(find.byTooltip('Mon profil'));
    await settle(tester);
    expect(find.text('Kouassi Marc'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Se déconnecter'),
      150,
      scrollable: find.byType(Scrollable).last,
    );
    await settle(tester);
    expect(find.text('Se déconnecter'), findsOneWidget);

    // La barre reste visible, sur l'onglet « Accueil ».
    expect(menu, findsOneWidget);
    expect(
      tester.widget<NavigationBar>(menu).selectedIndex,
      ClientTab.branches.indexOf('dashboard'),
    );
  });

  testWidgets('le menu reste visible sur toutes les pages', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    // Onglet courant sur l'accueil.
    final menu = find.byType(NavigationBar);
    expect(menu, findsOneWidget);
    expect(
      tester.widget<NavigationBar>(menu).selectedIndex,
      ClientTab.branches.indexOf('dashboard'),
    );

    // Page enfant : détail d'une panne.
    await tester.tap(find.text('Pannes'));
    await settle(tester);
    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester);
    expect(find.text('Demande'), findsOneWidget);
    expect(find.text('#TK-2026-001'), findsOneWidget);
    expect(menu, findsOneWidget);
    expect(
      tester.widget<NavigationBar>(menu).selectedIndex,
      ClientTab.branches.indexOf('tickets'),
      reason: 'le menu doit rester sur l\'onglet de la page affichée',
    );

    // Recliquer sur l'onglet courant ramène à sa page racine.
    await tester.tap(find.text('Pannes').last);
    await settle(tester);
    expect(find.text('Demande'), findsNothing);
    expect(find.byIcon(Icons.add_circle_rounded), findsOneWidget);

    // Page enfant : formulaire de signalement, sur l'onglet « Pannes ».
    await tester.tap(find.byIcon(Icons.add_circle_rounded));
    await settle(tester);
    expect(find.text('Nouvelle demande'), findsOneWidget);
    expect(menu, findsOneWidget);
    expect(
      tester.widget<NavigationBar>(menu).selectedIndex,
      ClientTab.branches.indexOf('tickets'),
    );

    // Le formulaire est aussi accessible depuis l'accueil : le menu doit
    // alors afficher « Pannes » comme onglet actif.
    await tester.pageBack();
    await settle(tester);
    await tester.tap(find.text('Accueil').last);
    await settle(tester);
    await tester.tap(find.text('Signaler une panne'));
    await settle(tester);
    expect(find.text('Nouvelle demande'), findsOneWidget);
    expect(
      tester.widget<NavigationBar>(menu).selectedIndex,
      ClientTab.branches.indexOf('tickets'),
      reason: 'l\'onglet actif suit l\'URL, pas l\'historique',
    );

    // Navigation depuis une page enfant vers un autre onglet.
    await tester.tap(find.text('Factures'));
    await settle(tester);
    expect(find.text('Factures'), findsWidgets);
    expect(
      tester.widget<NavigationBar>(menu).selectedIndex,
      ClientTab.branches.indexOf('invoices'),
    );

    // Page enfant : détail d'une facture.
    await tester.tap(find.text('Payé').first);
    await settle(tester);
    expect(menu, findsOneWidget);
  });

  testWidgets('l\'onglet « Accueil » ramène toujours au tableau de bord', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    final menu = find.byType(NavigationBar);

    // Le profil est une page enfant de la branche « Accueil ». Une fois
    // consulté, il devenait la position de retour de l'onglet : revenir sur
    // « Accueil » depuis « Pannes » rouvrait le profil au lieu du tableau de
    // bord, et le bouton paraissait ne rien faire.
    await tester.tap(find.byTooltip('Mon profil'));
    await settle(tester);
    expect(find.text('Kouassi Marc'), findsOneWidget);

    await tester.tap(find.text('Pannes').last);
    await settle(tester);
    expect(find.text('#TK-2026-001'), findsOneWidget);

    await tester.tap(find.text('Accueil').last);
    await settle(tester);

    expect(
      find.text('Bonjour Kouassi Marc'),
      findsOneWidget,
      reason: '« Accueil » doit afficher le tableau de bord, pas le profil',
    );
    expect(find.text('Kouassi Marc'), findsNothing);
    expect(
      tester.widget<NavigationBar>(menu).selectedIndex,
      ClientTab.branches.indexOf('dashboard'),
    );
  });

  testWidgets('l\'onglet « Accueil » ferme aussi les notifications', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    // Même règle pour l'autre page enfant de l'accueil.
    await tester.tap(find.byType(NotificationBell).first);
    await settle(tester);
    expect(find.text('Notifications'), findsWidgets);

    await tester.tap(find.text('Factures').last);
    await settle(tester);
    expect(find.text('Factures'), findsWidgets);

    await tester.tap(find.text('Accueil').last);
    await settle(tester);

    expect(find.text('Bonjour Kouassi Marc'), findsOneWidget);
  });

  testWidgets('les autres onglets conservent leur pile', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    // Contrairement à l'accueil, revenir sur « Factures » doit rouvrir la
    // facture consultée : une pile qu'on ne peut pas reprendre serait inutile.
    await tester.tap(find.text('Factures').last);
    await settle(tester);
    await tester.tap(find.text('Payé').first);
    await settle(tester);
    // Le détail recharge la facture par son identifiant ; son titre vaut
    // « Facture », absent de la liste.
    expect(find.text('Facture'), findsWidgets);

    await tester.tap(find.text('Pannes').last);
    await settle(tester);
    await tester.tap(find.text('Factures').last);
    await settle(tester);

    expect(
      find.text('Facture'),
      findsWidgets,
      reason: 'l\'onglet « Factures » doit rouvrir la facture quittée',
    );
  });

  testWidgets('inscription en trois étapes : propriétaire de zone', (tester) async {
    await pumpApp(tester);

    await tester.ensureVisible(find.text('Créer un compte'));
    await settle(tester);
    await tester.tap(find.text('Créer un compte'));
    await settle(tester);

    expect(find.text('Étape 1 sur 3 · Informations personnelles'), findsOneWidget);

    // Étape 1 : identité.
    await tester.enterText(find.byType(TextField).at(0), 'Kouassi');
    await tester.enterText(find.byType(TextField).at(1), 'Marc');
    await tester.enterText(find.byType(TextField).at(2), '0707070707');
    await settle(tester);

    await tester.tap(find.text('Continuer'));
    await settle(tester);

    expect(find.text('Étape 2 sur 3 · Zone Wi-Fi'), findsOneWidget);
    expect(find.textContaining('Nom de la zone Wi-Fi'), findsOneWidget);

    // Étape 2 : zone.
    await tester.enterText(find.byType(TextField).at(0), 'Zone Test');
    await tester.enterText(find.byType(TextField).at(1), 'Cocody');
    await settle(tester);

    await tester.tap(find.text('Continuer'));
    await settle(tester);

    expect(find.text('Étape 3 sur 3 · Sécurité'), findsOneWidget);

    // Le mot de passe ne correspond pas : le champ est signalé.
    await tester.enterText(find.byType(TextField).at(0), '1234');
    await tester.enterText(find.byType(TextField).at(1), '9999');
    await settle(tester);

    await tester.tap(find.text('Créer mon compte'));
    await settle(tester, steps: 3);
    expect(
      find.text('Les deux mots de passe ne correspondent pas.'),
      findsNWidgets(2),
      reason: 'le toast et l\'erreur du champ de confirmation',
    );
    expect(adapter.calls.contains('POST /auth/register'), isFalse);

    await tester.enterText(find.byType(TextField).at(1), '1234');
    await settle(tester);
    await tester.tap(find.text('Créer mon compte'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('POST /auth/register'));
    expect(find.text('Créer mon compte'), findsNothing);
    expect(find.textContaining('Bonjour'), findsOneWidget);
  });

  testWidgets('inscription technicien : l\'étape zone est sautée', (tester) async {
    await pumpApp(tester);

    await tester.ensureVisible(find.text('Créer un compte'));
    await settle(tester);
    await tester.tap(find.text('Créer un compte'));
    await settle(tester);

    await tester.tap(find.text('Technicien'));
    await settle(tester);

    await tester.enterText(find.byType(TextField).at(0), 'Awa');
    await tester.enterText(find.byType(TextField).at(1), 'Traoré');
    await tester.enterText(find.byType(TextField).at(2), '0102030405');
    await settle(tester);

    await tester.tap(find.text('Continuer'));
    await settle(tester);

    expect(find.text('Étape 2 sur 2 · Sécurité'), findsOneWidget);
    expect(find.textContaining('Nom de la zone Wi-Fi'), findsNothing);

    await tester.enterText(find.byType(TextField).at(0), '4321');
    await tester.enterText(find.byType(TextField).at(1), '4321');
    await settle(tester);

    await tester.tap(find.text('Créer mon compte'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('POST /auth/register'));
  });

  testWidgets('ajout d\'une zone Wi-Fi', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.text('Équipements'));
    await settle(tester);

    await tester.ensureVisible(find.text('Ajouter une zone'));
    await settle(tester);
    await tester.tap(find.text('Ajouter une zone'));
    await settle(tester);

    expect(find.text('Nouvelle zone Wi-Fi'), findsOneWidget);

    final sheet = find.byType(BottomSheet);
    await tester.enterText(
      find.descendant(of: sheet, matching: find.byType(TextField)).at(0),
      'Zone Riviera',
    );
    await settle(tester);

    await tester.tap(find.text('Ajouter la zone'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('POST /wifi-zones'));
  });

  testWidgets('client : heure d\'arrivée du technicien', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.text('Pannes'));
    await settle(tester);

    await tester.tap(find.text('#TK-2026-010'));
    await settle(tester, steps: 20);

    expect(find.text('Arrivée du technicien'), findsOneWidget);
    expect(find.text('dans 7 min'), findsOneWidget);
    expect(find.text('à 2,4 km'), findsOneWidget);
  });

  testWidgets('client : sans destination, aucune ETA inventée', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.text('Pannes'));
    await settle(tester);

    await tester.tap(find.text('#TK-2026-001'));
    await settle(tester, steps: 20);

    // La demande est diagnostiquée, pas en route : aucune promesse d'arrivée.
    expect(find.text('Arrivée du technicien'), findsNothing);
  });

  testWidgets('client : relance le technicien dont le suivi s\'est arrêté', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);

    // Les routes sont posées **avant** `pumpApp` : le tableau de bord lit déjà
    // les demandes au démarrage, donc une route installée ensuite ne serait
    // jamais consultée — le fournisseur Riverpod servirait sa réponse en cache.
    // Une seule demande dans la liste : sa carte tient dans le premier écran,
    // et le test n'a pas à faire défiler pour la toucher.
    adapter.routes['/tickets'] = (_, _) => FakeApiData.ticketPage([_perduTicket]);
    adapter.routes['/tickets/t-perdu'] = (_, _) => {'data': _perduTicket};
    adapter.routes['/tickets/t-perdu/tracking/nudge'] = (_, _) => {
      'data': {'ok': true},
    };
    await pumpApp(tester);

    await tester.tap(find.text('Pannes'));
    await settle(tester);

    await tester.tap(find.text('#TK-2026-011'));
    await settle(tester, steps: 20);

    // Suivi arrêté : ni ETA ni distance ne doivent être affirmées au client.
    expect(find.text('dans 7 min'), findsNothing);
    expect(find.text('à 2,4 km'), findsNothing);

    await tester.tap(find.text('Relancer le technicien'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('POST /tickets/t-perdu/tracking/nudge'));
    expect(find.text('Le technicien a été prévenu.'), findsOneWidget);
  });
  testWidgets('notifications : badge, ouverture et redirection vers la panne', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    // Le badge annonce le nombre de non-lus renvoyé par l'API.
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

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Demande transmise au technicien'), findsOneWidget);
    expect(
      find.text('#TK-2026-001 a été transmise à Jean Dupont.'),
      findsOneWidget,
    );
    expect(find.text('Tout lire'), findsOneWidget);

    // Ouvrir une notification la marque comme lue puis ouvre la demande.
    await tester.tap(find.text('Demande transmise au technicien'));
    await settle(tester, steps: 20);

    expect(adapter.calls, contains('PATCH /notifications/n-1'));
    expect(find.text('#TK-2026-001'), findsWidgets);

    // Retour à la liste : la notification est lue, « Tout lire » n'a plus rien
    // à vider.
    await tester.pageBack();
    await settle(tester, steps: 20);

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Tout lire'), findsNothing);

    // Et de retour sur l'accueil, le badge a disparu.
    await tester.pageBack();
    await settle(tester, steps: 20);

    expect(find.byType(NotificationBell), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(NotificationBell),
        matching: find.text('1'),
      ),
      findsNothing,
    );
  });

  testWidgets('notifications : une notification lue se supprime au balayage', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.byType(NotificationBell));
    await settle(tester, steps: 20);

    expect(find.text('#TK-2026-002 : Clôturée'), findsOneWidget);

    // La notification lue est supprimable. Balayer une notification **non** lue
    // ne doit rien déclencher : elle porte une information pas encore vue.
    await tester.drag(
      find.text('#TK-2026-002 : Clôturée'),
      const Offset(-500, 0),
    );
    await settle(tester, steps: 20);

    // La confirmation est demandée : une suppression est définitive.
    expect(find.text('Supprimer la notification'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    await settle(tester, steps: 20);
    expect(find.text('#TK-2026-002 : Clôturée'), findsOneWidget);

    // Cette fois, on confirme.
    await tester.drag(
      find.text('#TK-2026-002 : Clôturée'),
      const Offset(-500, 0),
    );
    await settle(tester, steps: 20);
    await tester.tap(find.widgetWithText(FilledButton, 'Supprimer'));
    await settle(tester, steps: 20);

    expect(find.text('#TK-2026-002 : Clôturée'), findsNothing);

    // La ligne non lue reste : elle n'a pas encore été consommée.
    expect(find.text('Demande transmise au technicien'), findsOneWidget);
  });

  testWidgets('notifications : le flux temps réel met à jour le badge', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues(_session);

    // Le flux est piloté par le test : une notification peut être poussée à tout
    // moment, sans attendre la fin d'un intervalle.
    final controller = StreamController<Uint8List>();

    adapter.streams['/notifications/stream'] = controller.stream;

    await pumpApp(tester);

    // Aucune notification reçue : le compteur reste celui de l'API.
    expect(
      find.descendant(
        of: find.byType(NotificationBell),
        matching: find.text('1'),
      ),
      findsOneWidget,
    );

    // Message de la régie : « event: notification » puis sa ligne `data:`.
    controller.add(
      Uint8List.fromList(
        utf8.encode(
          'event: notification\n'
          'data: ${jsonEncode({
                'id': 'n-live',
                'type': 'BROADCAST',
                'title': 'Coupure réseau',
                'body': 'Intervention en cours sur le secteur nord.',
                'ticketId': null,
                'readAt': null,
                'createdAt': '2026-01-30T12:30:00.000Z',
              })}\n\n',
        ),
      ),
    );

    await settle(tester, steps: 20);

    expect(
      find.descendant(
        of: find.byType(NotificationBell),
        matching: find.text('2'),
      ),
      findsOneWidget,
      reason: 'une notification reçue en direct doit compter sans rechargement',
    );

    // Le message est consultable sans passer par l'API : il vient du flux.
    await tester.tap(find.byType(NotificationBell));
    await settle(tester, steps: 20);
    expect(find.text('Coupure réseau'), findsOneWidget);

    await controller.close();
  });

  testWidgets('notifications : « Tout lire » vide le badge', (tester) async {
    FlutterSecureStorage.setMockInitialValues(_session);
    await pumpApp(tester);

    await tester.tap(find.byType(NotificationBell));
    await settle(tester, steps: 20);

    await tester.tap(find.text('Tout lire'));
    await settle(tester, steps: 20);

    expect(find.text('Tout lire'), findsNothing);
  });
}
