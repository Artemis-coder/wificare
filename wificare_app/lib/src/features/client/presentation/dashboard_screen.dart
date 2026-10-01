import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_avatar.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/notification_bell.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../../notifications/application/notification_providers.dart';
import '../../tickets/application/ticket_queries.dart';

/// Accueil client : compteurs, demandes récentes, actions rapides.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final user = ref.watch(currentUserProvider);
    final client = ref.watch(clientAccountProvider);
    final asyncTickets = ref.watch(ticketListProvider(null));
    final stats = ref.watch(ticketStatsProvider);
    final unread = ref.watch(unreadCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Accueil'),
        actions: [
          NotificationBell(
            count: unread,
            onPressed: () => context.push(Routes.notifications),
          ),
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.md),
            child: Center(
              // L'avatar est l'unique accès au profil : l'onglet « Profil »
              // n'existe pas dans la barre de navigation.
              child: Tooltip(
                message: 'Mon profil',
                child: InkWell(
                  onTap: () => context.push(Routes.profile),
                  customBorder: const CircleBorder(),
                  child: AppAvatar(name: user?.displayName ?? 'Client', size: 36),
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(authControllerProvider.notifier).refreshProfile();
          ref.invalidate(ticketListProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.md,
            AppSpacing.xxl,
          ),
          children: [
            Text(
              'Bonjour ${user?.displayName ?? ''}',
              style: TextStyle(
                color: colors.onSurface,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              client?.name ?? 'Votre espace client',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: AppSpacing.md),
            if (client == null)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.md),
                child: ErrorBanner(
                  message: 'Aucun dossier client associé à ce compte. '
                      'Contactez le service commercial.',
                ),
              ),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: AppSpacing.sm,
              crossAxisSpacing: AppSpacing.sm,
              childAspectRatio: 1.45,
              children: [
                StatTile(
                  label: 'Ouverts',
                  value: '${stats.open}',
                  icon: Icons.report_outlined,
                  color: colors.neutral,
                ),
                StatTile(
                  label: 'En cours',
                  value: '${stats.inProgress}',
                  icon: Icons.pending_actions_rounded,
                  color: colors.secondary,
                ),
                StatTile(
                  label: 'Résolus',
                  value: '${stats.resolved}',
                  icon: Icons.check_circle_outline_rounded,
                  color: colors.success,
                ),
                StatTile(
                  label: 'Total',
                  value: '${stats.total}',
                  icon: Icons.inbox_rounded,
                  color: colors.info,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            const SectionHeader(title: 'Actions rapides'),
            Row(
              children: [
                Expanded(
                  child: _QuickAction(
                    label: 'Signaler une panne',
                    icon: Icons.wifi_off_rounded,
                    onTap: () => context.push('/home/tickets/new'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _QuickAction(
                    label: 'Mes équipements',
                    icon: Icons.router_rounded,
                    onTap: () => GoRouter.of(context).go('/home/equipments'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: _QuickAction(
                    label: 'Mes factures',
                    icon: Icons.receipt_long_rounded,
                    onTap: () => GoRouter.of(context).go('/home/invoices'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _QuickAction(
                    label: 'Mes demandes',
                    icon: Icons.list_alt_rounded,
                    onTap: () => GoRouter.of(context).go('/home/tickets'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            SectionHeader(
              title: 'Demandes récentes',
              trailing: TextButton(
                onPressed: () => GoRouter.of(context).go('/home/tickets'),
                child: const Text('Tout voir'),
              ),
            ),
            asyncTickets.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (error, _) => ErrorView(
                error: error,
                onRetry: () => ref.invalidate(ticketListProvider),
              ),
              data: (tickets) {
                if (tickets.isEmpty) {
                  return const AppCard(
                    child: Text('Aucune demande pour le moment.'),
                  );
                }

                final recent = tickets.take(3).toList();
                return Column(
                  children: [
                    for (final ticket in recent)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: AppCard(
                          onTap: () => context.push('/home/tickets/${ticket.id}'),
                          child: Row(
                            children: [
                              Container(
                                width: 4,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: ticket.status.color,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      ticket.reference,
                                      style: TextStyle(
                                        color: colors.onSurface,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${ticket.type} · ${ticket.zoneName}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: colors.onSurfaceVariant,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(Icons.chevron_right_rounded, size: 18),
                            ],
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: colors.primary, size: 22),
          const SizedBox(height: AppSpacing.sm),
          Text(
            label,
            maxLines: 2,
            style: TextStyle(
              color: colors.onSurface,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
