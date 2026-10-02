import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/models.dart';
import '../../../core/providers/app_visibility.dart';
import '../../../core/providers/infra_providers.dart';
import '../../auth/application/auth_controller.dart';
import '../data/notification_repository.dart';
import '../data/notification_stream.dart';

/// Délai entre deux relances tant que l'écran des notifications est ouvert.
///
/// Le flux temps réel apporte la notification dès son écriture ; ce délai ne
/// sert plus que de filet de sécurité quand le flux est coupé, et borne le temps
/// d'attente d'un poste dont le réseau vient de revenir.
const Duration kNotificationPollInterval = Duration(seconds: 30);

final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => NotificationRepository(ref.watch(apiClientProvider)),
);

final notificationStreamProvider = Provider<NotificationStream>(
  (ref) => NotificationStream(ref.watch(apiClientProvider)),
);

/// Notifications du compte connecté.
///
/// Le résultat est mis en cache tant qu'un écran l'observe (cloche du tableau
/// de bord, profil, liste) : le compteur de non-lus ne déclenche donc qu'un seul
/// aller-retour réseau. Le rafraîchissement est déclenché explicitement
/// ([refreshNotifications]) plutôt que permanent, pour ne laisser aucun timer
/// actif en arrière-plan.
///
/// Les notifications reçues par le flux temps réel y sont fusionnées : elles ne
/// figureront qu'à la prochaine lecture de l'API, et l'utilisateur ne doit pas
/// attendre cela pour les voir.
final notificationFeedProvider = FutureProvider.autoDispose<NotificationFeed>((ref) async {
  if (ref.watch(currentUserProvider) == null) {
    return const NotificationFeed(items: [], unreadCount: 0);
  }

  final feed = await ref.watch(notificationRepositoryProvider).feed();
  final live = ref.watch(liveNotificationsProvider).asData?.value ?? const [];

  return feed.merge(live);
});

/// Notifications arrivant par le flux temps réel, parvenue à expiration.
///
/// Le flux n'est ouvert que tant qu'un écran observe ce provider, et il est
/// fermé au retrait : une connexion ouverte en arrière-plan consommerait la
/// batterie et le forfait sans que personne regarde. L'application fermée, le
/// relais est le push.
final liveNotificationsProvider = StreamProvider.autoDispose<List<AppNotification>>((ref) async* {
  if (ref.watch(currentUserProvider) == null) {
    return;
  }

  // La fermeture du provider vaut « plus personne ne regarde » : la boucle de
  // reconnexion s'en sert pour ne pas rouvrir un flux après le retrait.
  var active = true;

  ref.onDispose(() {
    active = false;
  });

  // Le flux ne tourne qu'au premier plan. En arrière-plan, le relais est le
  // push : garder une connexion ouverte ne rapporterait rien et coûterait
  // batterie et forfait.
  final foreground = ref.watch(isForegroundProvider);

  if (!foreground) {
    return;
  }

  final received = <AppNotification>[];

  final live = ref.watch(notificationStreamProvider);

  // Le retrait du provider doit fermer la connexion et annuler la reconnexion
  // programmée : sans cela le minuteur resterait armé après la fermeture de
  // l'écran.
  ref.onDispose(live.cancel);

  await for (final notification in live.listen(isActive: () => active)) {
    received.insert(0, notification);

    // La liste est bornée : elle ne sert qu'au compteur, et garder toute la
    // session en mémoire n'aurait aucun usage.
    if (received.length > 20) {
      received.removeLast();
    }

    yield List<AppNotification>.unmodifiable(received);
  }
});

/// Nombre de notifications non lues, pour le badge de la cloche.
///
/// Le flux est fusionné dans la liste, dont le compteur fait foi : additionner
/// les deux compterait deux fois ce que la fusion a déjà intégré.
final unreadCountProvider = Provider<int>(
  (ref) => ref.watch(notificationFeedProvider).value?.unreadCount ?? 0,
);

/// Recharge la liste et le badge.
void refreshNotifications(WidgetRef ref) =>
    ref.invalidate(notificationFeedProvider);

/// Marque une notification comme lue, puis rafraîchit le badge.
Future<void> markNotificationRead(WidgetRef ref, String id) async {
  await ref.read(notificationRepositoryProvider).markRead(id);
  refreshNotifications(ref);
}

/// Supprime une notification, puis recharge le flux.
///
/// Le rechargement suit la suppression au lieu de retirer la ligne à la main :
/// le compteur de non-lus est recalculé par le serveur, et c'est lui qui fait
/// foi. Une ligne retirée localement ferait diverger le compteur de la cloche
/// jusqu'au rechargement suivant.
Future<void> deleteNotification(WidgetRef ref, String id) async {
  await ref.read(notificationRepositoryProvider).delete(id);
  refreshNotifications(ref);
}

/// Marque toutes les notifications comme lues.
Future<void> markAllNotificationsRead(WidgetRef ref) async {
  await ref.read(notificationRepositoryProvider).markAllRead();
  refreshNotifications(ref);
}