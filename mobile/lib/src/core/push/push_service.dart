import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'eta_notification.dart';

/// Identifiant du canal de notification Android.
///
/// Doit correspondre au `channelId` envoyé par le serveur
/// (`src/lib/push.ts`) : une notification reçue par un canal inexistant
/// s'affiche dans un canal créé automatiquement, avec une importance faible et
/// donc sans son propre son.
const String kNotificationChannelId = 'wificare_notifications';

/// Réception des notifications hors application.
///
/// **Ne dessine rien.** Le serveur envoie un message porteur d'un bloc
/// `notification` : c'est le SDK Android qui l'affiche lui-même quand
/// l'application est en arrière-plan ou arrêtée, sur le canal
/// [kNotificationChannelId]. Dessiner ici en plus produirait deux bulles et
/// deux sons pour un seul message — le défaut le plus visible de tout le push,
/// et il ne se verrait qu'en conditions réelles, téléphone en poche.
///
/// Le handler reste enregistré pour que le processus soit réveillé et que le
/// jeton puisse être rafraîchi ; et parce qu'un message *sans* bloc
/// `notification` (donnée seule) n'est jamais dessiné par le système, il faut
/// savoir le traiter. `showLocalNotification` couvre les deux : premier plan, où
/// le SDK ne dessine rien, et message de données.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();

  await handleTrackingMessage(message.data);

  if (message.notification != null) {
    // Dessiné par le SDK, avec son canal et son importance.
    return;
  }

  final title = message.data['title'] as String?;
  final body = message.data['body'] as String?;

  if (title == null || title.isEmpty) {
    return;
  }

  await showLocalNotification(
    title: title,
    body: body ?? '',
    payload: message.data['ticketId'] as String?,
  );
}

/// Traite un message de suivi de position.
///
/// Volontairement en amont de tout le reste : le suivi arrive en donnée seule,
/// donc personne d'autre ne l'affichera, et une ETA qui ne s'affiche pas est
/// silencieusement perdue — le client ne verrait qu'un technicien « en route »
/// sans horizon.
///
/// La relance demandée au technicien (`TRACKING_NUDGE`) ne concerne pas le
/// client : son téléphone ignore ce message sans bruit, sans notification vide.
Future<void> handleTrackingMessage(Map<String, dynamic> data) async {
  if (data['type'] != 'TRACKING_UPDATE') {
    return;
  }

  final ticketId = data['ticketId'] as String?;
  if (ticketId == null || ticketId.isEmpty) {
    return;
  }

  // Une ETA vide n'a pas d'heure d'arrivée à annoncer : mieux vaut ne rien
  // afficher que d'afficher « arrivée dans 0 min ».
  final eta = _asInt(data['etaMinutes']);
  if (eta == null || eta <= 0) {
    await cancelEtaNotification(ticketId);
    return;
  }

  await ensureEtaChannel();
  await showEtaNotification(
    ticketId: ticketId,
    reference: (data['reference'] as String?)?.trim().isNotEmpty == true
        ? data['reference'] as String
        : 'Technicien en route',
    etaMinutes: eta,
    distanceMeters: _asInt(data['distanceMeters']),
  );
}

int? _asInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
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

  /// Un jeton peut être renouvelé sans que l'utilisateur se reconnecte : c'est
  /// le seul moment où le serveur peut en être informé. L'abonnement est posé
  /// une seule fois, l'annonce de l'appareil pouvant être répétée.
  bool _tokenRefreshSubscribed = false;

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

      if (!_tokenRefreshSubscribed) {
        _tokenRefreshSubscribed = true;

        FirebaseMessaging.instance.onTokenRefresh.listen((refreshed) {
          send(refreshed).catchError((Object _) {});
        });
      }
    } catch (error) {
      debugPrint('Enregistrement du jeton de push impossible : $error');
    }
  }

  /// Premier plan : le SDK ne dessine rien, l'application le fait elle-même.
  ///
  /// Sans cela, une notification reçue alors que l'application est ouverte se
  /// limiterait à incrémenter une cloche — l'utilisateur voit qu'il a quelque
  /// chose à regarder, sans être tenté de le faire maintenant.
  Future<void> _onForegroundMessage(RemoteMessage message) async {
    // Le suivi passe avant tout : c'est un message de donnée, donc personne
    // d'autre ne l'affichera.
    await handleTrackingMessage(message.data);

    final notification = message.notification;

    if (notification != null) {
      await showLocalNotification(
        title: notification.title ?? 'WiFiCare',
        body: notification.body ?? '',
        payload: message.data['ticketId'] as String?,
      );

      return;
    }

    final title = message.data['title'] as String?;

    if (title == null || title.isEmpty) {
      return;
    }

    await showLocalNotification(
      title: title,
      body: message.data['body'] as String? ?? '',
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
