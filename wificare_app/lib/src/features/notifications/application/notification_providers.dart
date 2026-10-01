import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/models.dart';
import '../../../core/providers/infra_providers.dart';
import '../../auth/application/auth_controller.dart';
import '../data/notification_repository.dart';

/// Délai entre deux relances tant que l'écran des notifications est ouvert.
///
/// L'API ne propose pas de push : c'est ce délai qui borne le délai
/// d'apparition d'une notification à l'écran.
const Duration kNotificationPollInterval = Duration(seconds: 30);

final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => NotificationRepository(ref.watch(apiClientProvider)),
);

/// Notifications du compte connecté.
///
/// Le résultat est mis en cache tant qu'un écran l'observe (cloche du tableau
/// de bord, profil, liste) : le compteur de non-lus ne déclenche donc qu'un seul
/// aller-retour réseau. Le rafraîchissement est déclenché explicitement
/// ([refreshNotifications]) plutôt que permanent, pour ne laisser aucun timer
/// actif en arrière-plan.
final notificationFeedProvider = FutureProvider.autoDispose<NotificationFeed>((ref) async {
  if (ref.watch(currentUserProvider) == null) {
    return const NotificationFeed(items: [], unreadCount: 0);
  }

  return ref.watch(notificationRepositoryProvider).feed();
});

/// Nombre de notifications non lues, pour le badge de la cloche.
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

/// Marque toutes les notifications comme lues.
Future<void> markAllNotificationsRead(WidgetRef ref) async {
  await ref.read(notificationRepositoryProvider).markAllRead();
  refreshNotifications(ref);
}