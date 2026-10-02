import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../application/notification_providers.dart';

/// Historique des notifications du compte connecté.
///
/// Écran partagé par le client et le technicien : seul le détail vers lequel
/// une notification redirige dépend du rôle (la redirection du `GoRouter`
/// renvoie de toute façon vers le bon espace si la route demandée n'existe pas).
///
/// Le rafraîchissement périodique est géré ici plutôt que dans un provider :
/// le timer naît avec l'écran et meurt avec lui, donc aucune requête ne
/// continue en arrière-plan une fois l'écran fermé.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  Timer? _poll;

  @override
  void initState() {
    super.initState();

    // Une notification créée ailleurs (demande soumise depuis un autre poste)
    // apparaît sans que l'utilisateur ait à tirer l'écran vers le bas.
    _poll = Timer.periodic(kNotificationPollInterval, (_) {
      if (mounted) refreshNotifications(ref);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(notificationFeedProvider);
    final unread = ref.watch(unreadCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: () => markAllNotificationsRead(ref),
              child: const Text('Tout lire'),
            ),
        ],
      ),
      body: feed.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () => refreshNotifications(ref),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () async => refreshNotifications(ref),
          child: data.items.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 120),
                    EmptyState(
                      title: 'Aucune notification',
                      message:
                          'Vous serez prévenu ici dès qu\'une demande sera '
                          'transmise ou qu\'une intervention avancera.',
                      icon: Icons.notifications_none_rounded,
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  itemCount: data.items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (context, index) {
                    final item = data.items[index];

                    // Le balayage n'est proposé que sur une notification lue.
                    // Une notification encore non lue porte un fait que
                    // l'utilisateur n'a pas vu : la retirer sans confirmation
                    // lui ferait perdre une information sans qu'il l'ait
                    // pourtant lue, et le compteur de non-lus n'aurait plus rien
                    // à signaler.
                    if (!item.isRead) return _NotificationTile(notification: item);

                    return Dismissible(
                      key: ValueKey(item.id),
                      direction: DismissDirection.endToStart,
                      background: const _DeleteBackground(),
                      confirmDismiss: (_) => _confirmDelete(context, item),
                      onDismissed: (_) async {
                        try {
                          await deleteNotification(ref, item.id);
                        } on ApiException catch (error) {
                          if (context.mounted) {
                            showAppSnackBar(
                              context,
                              error.message,
                              isError: true,
                            );
                          }
                        }
                      },
                      child: _NotificationTile(notification: item),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

/// Ce que révèle le balayage : ce qui va se passer, pas un simple effacement.
class _DeleteBackground extends StatelessWidget {
  const _DeleteBackground();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Container(
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.only(right: AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.error,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Icon(Icons.delete_outline_rounded, color: colors.onSurface),
          const SizedBox(width: AppSpacing.sm),
          Text(
            'Supprimer',
            style: TextStyle(
              color: colors.onSurface,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Confirmation avant une suppression : elle est définitive, et une notification
/// supprimée ne revient pas au balayage suivant.
Future<bool> _confirmDelete(
  BuildContext context,
  AppNotification notification,
) async {
  return await confirmDialog(
        context,
        title: 'Supprimer la notification',
        message:
            '« ${notification.title} » sera retirée de votre liste. Cette action '
            'est définitive.',
        confirmLabel: 'Supprimer',
        cancelLabel: 'Annuler',
        destructive: true,
      );
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final ticketId = notification.ticketId;

    return AppCard(
      borderColor: notification.isRead ? null : colors.primary.withValues(alpha: 0.35),
      onTap: () async {
        // Ouvrir la notification la consomme : la date de lecture est
        // registered avant la navigation pour que le badge soit à jour au
        // retour.
        if (!notification.isRead) {
          await markNotificationRead(ref, notification.id);
        }
        if (ticketId == null || !context.mounted) return;

        final session = ref.read(authControllerProvider).value;
        final isTechnician = session?.user.role == UserRole.technician;

        context.push(
          isTechnician
              ? TechnicianRoutes.ticketDetail.replaceFirst(':id', ticketId)
              : Routes.ticketDetail.replaceFirst(':id', ticketId),
        );
      },
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(AppSpacing.sm),
            decoration: BoxDecoration(
              color: (notification.isRead ? colors.onSurfaceVariant : colors.primary)
                  .withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(
              notification.type.icon,
              size: 20,
              color: notification.isRead ? colors.onSurfaceVariant : colors.primary,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        notification.title,
                        style: TextStyle(
                          color: colors.onSurface,
                          fontSize: 14,
                          fontWeight: notification.isRead
                              ? FontWeight.w600
                              : FontWeight.w700,
                        ),
                      ),
                    ),
                    if (!notification.isRead)
                      Container(
                        margin: const EdgeInsets.only(left: AppSpacing.sm),
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: colors.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  notification.body,
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  Fmt.relativeDay(notification.createdAt),
                  style: TextStyle(
                    color: colors.onSurfaceVariant,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}