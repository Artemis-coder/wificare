import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
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

void _markRead(List<Map<String, dynamic>> items, String id) {
  for (final item in items) {
    if (item['id'] == id) item['readAt'] = '2026-01-30T12:00:00.000Z';
  }
}

Map<String, dynamic> _notificationById(
  List<Map<String, dynamic>> items,
  String id,
) => items.firstWhere((item) => item['id'] == id);

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
          FakeApiData.ticket('t-2', '#TK-2026-002', 'COMPLETED'),
        ]);
      },
      '/notifications': (_, _) => FakeApiData.notificationFeed(notifications),
      'PATCH /notifications': (_, _) {
        for (final item in notifications) {
          item['readAt'] = '2026-01-30T12:00:00.000Z';
        }
        return {'data': {'markedAsRead': notifications.length}};
      },
      '/notifications/n-1': (_, _) {
        _markRead(notifications, 'n-1');
        return {'data': _notificationById(notifications, 'n-1')};
      },
      '/quote-invoices': (_, _) => {
        'data': [
          {
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
          },
        ],
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
  });

  Widget buildApp() {
    final dio = Dio();
    dio.httpClientAdapter = adapter;
    final refreshDio = Dio()..httpClientAdapter = adapter;
    final storage = TokenStorage();

    return ProviderScope(
      overrides: [
        apiClientProvider.overrideWith(
          (ref) => ApiClient(tokenStorage: storage, dio: dio, refreshDio: refreshDio),
        ),
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

  Future<void> pumpApp(WidgetTester tester) async {
    // Format proche d'un téléphone réel pour que la mise en page soit représentative.
    tester.view.physicalSize = const Size(1280, 2856);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(buildApp());
    await settle(tester);
  }

  testWidgets('connexion par mot de passe puis tableau de bord', (tester) async {
    await pumpApp(tester);

    expect(find.text('Se connecter'), findsOneWidget);
    expect(find.text('Type de compte'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), '2250707070707');
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

    await tester.enterText(find.byType(TextField).at(0), '2250707070707');
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

    // Numéro invalide : message éphémère + champ téléphone signalé.
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 3);
    // Message éphémère (toast) + erreur affichée sous le champ téléphone.
    expect(find.text('Saisissez un numéro de téléphone valide.'), findsNWidgets(2));

    await tester.enterText(find.byType(TextField).at(0), '2250707070707');
    await settle(tester);

    // Mot de passe incomplet.
    await tester.tap(find.text('Se connecter'));
    await settle(tester, steps: 3);
    expect(find.text('Le mot de passe comporte 4 chiffres.'), findsOneWidget);
    expect(find.textContaining('Se connecter'), findsWidgets);
  });

  testWidgets('connexion : un type de compte incohérent cible le sélecteur', (
    tester,
  ) async {
    loginStatus = 403;
    loginError = "Ce compte n'est pas un compte propriétaire de zone.";
    await pumpApp(tester);
    adapter.statuses['/auth/login'] = 403;

    await tester.enterText(find.byType(TextField).at(0), '2250102030405');
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

    // Quatre onglets seulement : plus de « Profil ».
    final menu = find.byType(NavigationBar);
    expect(menu, findsOneWidget);
    expect(find.text('Profil'), findsNothing);
    expect(
      tester.widget<NavigationBar>(menu).destinations.length,
      4,
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
    await tester.enterText(find.byType(TextField).at(2), '2250707070707');
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
    await tester.enterText(find.byType(TextField).at(2), '2250102030405');
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
