import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Identifiant du canal de notification Android.
///
/// Doit correspondre au `channelId` envoyé par le serveur
/// (`src/lib/push.ts`) : une notification reçue par un canal inexistant
/// s'affiche dans un canal créé automatiquement, avec une importance faible et
/// donc sans son propre son.
const String kNotificationChannelId = 'wificare_notifications';

/// Affiche une notification reçue alors que l'application est en arrière-plan.
///
/// Obligatoirement une fonction de premier niveau : Firebase l'instancie dans
/// un isolate séparé, et une méthode d'instance n'y serait pas accessible.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();

  final notification = message.notification;

  if (notification == null) {
    return;
  }

  await showLocalNotification(
    title: notification.title ?? 'WiFiCare',
    body: notification.body ?? '',
    payload: message.data['ticketId'] as String?,
  );
}

/// Affiche une notification dans la barre d'état.
///
/// `flutter_local_notifications` est nécessaire en plus de Firebase : quand
/// l'application est au premier plan, Firebase ne dessine rien de lui-même.
Future<void> showLocalNotification({
  required String title,
  required String body,
  String? payload,
}) async {
  final plugin = FlutterLocalNotificationsPlugin();

  const details = AndroidNotificationDetails(
    kNotificationChannelId,
    'Notifications WiFiCare',
    channelDescription: 'Demandes d\'intervention et changements de statut.',
    importance: Importance.high,
    priority: Priority.high,
  );

  await plugin.show(
    id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
    title: title,
    body: body,
    notificationDetails: const NotificationDetails(android: details),
    payload: payload,
  );
}

/// Réception des notifications hors application.
///
/// Le service est tolérant à l'absence de configuration Firebase : sans
/// `google-services.json`, `Firebase.initializeApp` échoue et l'application
/// continue de fonctionner sur ses notifications internes. Une plateforme qui
/// perdrait ses notifications à cause d'un fichier manquant serait pire
/// qu'une plateforme qui les affiche en retard.
class PushService {
  PushService();

  final _local = FlutterLocalNotificationsPlugin();

  /// Identifiant de la demande reçue et sur laquelle l'utilisateur a tapé,
  /// à ouvrir au retour dans l'application.
  String? _pendingTicketId;

  bool _available = false;
  bool _initialized = false;

  /// Vrai si Firebase a pu démarrer : le push fonctionne alors.
  bool get isAvailable => _available;

  String? takePendingTicketId() {
    final ticketId = _pendingTicketId;
    _pendingTicketId = null;
    return ticketId;
  }

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    try {
      await Firebase.initializeApp();

      if (!Platform.isAndroid) {
        return;
      }

      await _createChannel();

      // Les notifications au premier plan ne sont pas dessinées par Firebase :
      // l'application les affiche elle-même pour qu'elles soient identiques à
      // celles reçues en arrière-plan.
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);

      FirebaseMessaging.onMessageOpenedApp.listen(_onOpened);

      // Message ayant ouvert l'application depuis un état arrêté.
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        _onOpened(initial);
      }

      _available = true;
    } catch (error) {
      _available = false;
      debugPrint(
        'Push non disponible (configuration Firebase absente) : $error',
      );
    }
  }

  /// Demande l'autorisation d'afficher des notifications.
  ///
  /// Android 13 (API 33) a rendu cette autorisation explicite : sans elle,
  /// aucune notification n'est affichée, même reçue. Le refus est silencieux :
  /// l'utilisateur reste annoncé dans l'application.
  Future<bool> requestPermission() async {
    if (!_available) return false;

    final settings = await FirebaseMessaging.instance.requestPermission();

    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  Future<void> _createChannel() async {
    final android = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();

    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        kNotificationChannelId,
        'Notifications WiFiCare',
        description: 'Demandes d\'intervention et changements de statut.',
        importance: Importance.high,
      ),
    );
  }

  /// Enregistre le jeton de cet appareil auprès du serveur.
  ///
  /// Appelé à chaque ouverture de session : Firebase peut renouveler le jeton
  /// à la réinstallation ou au changement d'appareil, et le serveur doit
  /// détenir le jeton valide le plus récent.
  Future<void> registerToken(Future<void> Function(String token) send) async {
    if (!_available) return;

    try {
      final token = await FirebaseMessaging.instance.getToken();

      if (token == null || token.isEmpty) {
        return;
      }

      await send(token);
    } catch (error) {
      debugPrint('Enregistrement du jeton de push impossible : $error');
    }
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;

    if (notification == null) return;

    await showLocalNotification(
      title: notification.title ?? 'WiFiCare',
      body: notification.body ?? '',
      payload: message.data['ticketId'] as String?,
    );
  }

  void _onOpened(RemoteMessage message) {
    final ticketId = message.data['ticketId'] as String?;

    if (ticketId != null && ticketId.isNotEmpty) {
      _pendingTicketId = ticketId;
    }
  }
}
