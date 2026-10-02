import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Canal de l'estimation d'arrivée.
///
/// Importance **basse**, et surtout `sound: null` : cette notification se met à
/// jour toutes les deux minutes pendant tout le trajet. Sur le canal principal,
/// dont l'importance est haute, chaque point ferait sonner le téléphone — une
/// sonnerie toutes les deux minutes pendant que le client attend est exactement
/// ce qui fait qu'on désactive les notifications d'une application.
const String kEtaChannelId = 'wificare_eta';

/// Identifiant de notification Android.
///
/// Doit rester **stable** et vigilant borné : `flutter_local_notifications`
/// remplace la notification portant le même identifiant au lieu d'en empiler
/// une nouvelle. Un identifiant tiré de l'heure ferait s'accumuler une bannière
/// par point de trajet, et le client ne verrait plus l'heure d'arrivée du tout.
///
/// 10 bits suffisent : le résultat tient largement dans un petit entier, donc
/// il peut être utilisé directement comme identifiant.
int _etaNotificationId(String ticketId) => ticketId.hashCode & 0x3FF;

/// Crée le canal s'il n'existe pas encore.
///
/// Sans cela, Android crée le canal à la première notification avec une
/// importance par défaut — **avec son**. Le son d'une notification de suivi
/// serait alors décidé par le système, et non par nous.
Future<void> ensureEtaChannel() async {
  await FlutterLocalNotificationsPlugin()
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(
        const AndroidNotificationChannel(
          kEtaChannelId,
          'Arrivée du technicien',
          description:
              'Estimation du temps d\'arrivée, mise à jour pendant le trajet.',
          importance: Importance.low,
        ),
      );
}

/// Affiche la position du technicien en cours de trajet.
///
/// **Notification persistante** (`ongoing`) : elle reste affichée en permanence
/// dans la zone de notification, exactement là où l'utilisateur regarde en
/// attendant le technicien — c'est l'équivalent Android de ce qu'iOS appelle la
/// Dynamic Island. Elle n'est ni déplaçable ni effaçable, ce qui est le
/// comportement voulu : une ETA qu'on peut faire disparaître d'un geste n'est
/// plus une ETA.
///
/// Le chronomètre (`usesChronometer`) fait décompter l'heure d'arrivée sans
/// réveiller l'appareil : le texte affiché se met à jour tout seul, au lieu de
/// dépendre d'un minuteur qui viderait la batterie pour refaire le même dessin.
Future<void> showEtaNotification({
  required String ticketId,
  required String reference,
  required int etaMinutes,
  int? distanceMeters,
}) async {
  final plugin = FlutterLocalNotificationsPlugin();

  final details = AndroidNotificationDetails(
    kEtaChannelId,
    'Arrivée du technicien',
    channelDescription:
        'Estimation du temps d\'arrivée du technicien, mise à jour pendant le trajet.',
    importance: Importance.low,
    priority: Priority.low,
    ongoing: true,
    onlyAlertOnce: true,
    silent: true,
    // `when` est l'instant d'arrivée : Android en déduit le temps restant au
    // moment de l'affichage. Aucun minuteur côté application n'est nécessaire.
    usesChronometer: true,
    chronometerCountDown: true,
    when: DateTime.now().add(Duration(minutes: etaMinutes)).millisecondsSinceEpoch,
  );

  await plugin.show(
    id: _etaNotificationId(ticketId),
    title: reference,
    body: _body(etaMinutes, distanceMeters),
    notificationDetails: NotificationDetails(android: details),
    payload: ticketId,
  );
}

String _body(int etaMinutes, int? distanceMeters) {
  final arrival = etaMinutes <= 1 ? 'Arrivée imminente' : 'Arrivée dans $etaMinutes min';

  if (distanceMeters == null) return arrival;

  final distance = distanceMeters < 1000
      ? '$distanceMeters m'
      : '${(distanceMeters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';

  return '$arrival · à $distance';
}

/// Retire l'estimation d'arrivée.
///
/// Appelée quand le technicien n'est plus en route : laisser la notification
/// afficher « arrivée dans 7 min » alors que le trajet est terminé serait pire
/// que de ne rien montrer du tout.
Future<void> cancelEtaNotification(String ticketId) async {
  await FlutterLocalNotificationsPlugin().cancel(
    id: _etaNotificationId(ticketId),
  );
}