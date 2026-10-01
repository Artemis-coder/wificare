import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_avatar.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/notification_bell.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../../notifications/application/notification_providers.dart';
import '../application/technician_providers.dart';

/// Accueil technicien : ses compteurs, les demandes à traiter et les
/// prochaines interventions.
class TechnicianDashboardScreen extends ConsumerWidget {
  const TechnicianDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final user = ref.watch(currentUserProvider);
    final asyncTickets = ref.watch(technicianTicketsProvider(null));
    final stats = ref.watch(technicianStatsProvider);
    final unread = ref.watch(unreadCountProvider);

    // Priorité : ce qui n'est pas encore pris en charge, puis le reste.
    final tickets = [...?asyncTickets.value]
      ..sort((a, b) {
        final urgentA = a.priority == Priority.urgent ? 0 : 1;
        final urgentB = b.priority == Priority.urgent ? 0 : 1;
        if (urgentA != urgentB) return urgentA - urgentB;
        // Les dates de création sont optionnelles côté API.
        final createdB = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final createdA = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return createdB.compareTo(createdA);
      });
    final upcoming = tickets
        .where(
          (ticket) =>
              ticket.status != TicketStatus.completed &&
              ticket.status != TicketStatus.closed &&
              ticket.status != TicketStatus.canceled,
        )
        .take(3)
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes interventions'),
        actions: [
          NotificationBell(
            count: unread,
            onPressed: () => context.push(TechnicianRoutes.notifications),
          ),
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.md),
            child: Center(
              // Le profil reste hors de la barre de navigation.
              child: Tooltip(
                message: 'Mon profil',
                child: InkWell(
                  onTap: () => context.push(TechnicianRoutes.profile),
                  customBorder: const CircleBorder(),
                  child: AppAvatar(
                    name: user?.displayName ?? 'Technicien',
                    size: 36,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(authControllerProvider.notifier).refreshProfile();
          ref.invalidate(technicianTicketsProvider);
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
              'Voici vos demandes assignées',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: AppSpacing.md),
            const _WalletSummaryCard(),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: StatTile(
                    label: 'À traiter',
                    value: '${stats.toDo}',
                    icon: Icons.assignment_late_outlined,
                    color: colors.warning,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: StatTile(
                    label: 'En cours',
                    value: '${stats.inProgress}',
                    icon: Icons.handyman_outlined,
                    color: colors.secondary,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: StatTile(
                    label: 'Terminées',
                    value: '${stats.done}',
                    icon: Icons.task_alt_rounded,
                    color: colors.success,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            const SectionHeader(title: 'À traiter'),
            if (asyncTickets.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (asyncTickets.hasError)
              SizedBox(
                height: 220,
                child: ErrorView(
                  error: asyncTickets.error!,
                  onRetry: () =>
                      ref.invalidate(technicianTicketsProvider(null)),
                ),
              )
            else if (upcoming.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: Icons.inbox_rounded,
                  title: 'Aucune demande en attente',
                  message: 'Vos nouvelles interventions apparaîtront ici.',
                ),
              )
            else
              for (final ticket in upcoming)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _UpcomingTile(
                    ticket: ticket,
                    onTap: () => context.push(
                      '${TechnicianRoutes.tickets}/${ticket.id}',
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

/// Carte condensée d'une demande à traiter.
class _UpcomingTile extends StatelessWidget {
  const _UpcomingTile({required this.ticket, required this.onTap});

  final Ticket ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  ticket.reference,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              StatusBadge.ticket(ticket.status, dense: true),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusBadge.priority(ticket.priority),
              AppBadge(label: ticket.type, tone: AppBadgeTone.neutral),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${ticket.client?.name ?? 'Client'} · ${ticket.zoneName}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(
            Fmt.relativeDay(ticket.createdAt),
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

/// Accès au portefeuille, avec le chiffre du mois courant.
///
/// Sur l'accueil et non dans un onglet : un technicien qui veut savoir ce qu'il
/// a encaissé le regarde au moment d'ouvrir l'application, pas en choisissant
/// une section. Le montant est celui du mois — le seul chiffre qui serve à
/// décider — et il mène à l'historique complet.
class _WalletSummaryCard extends ConsumerWidget {
  const _WalletSummaryCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final async = ref.watch(technicianWalletProvider);

    return AppCard(
      onTap: () => context.push(TechnicianRoutes.wallet),
      child: Row(
        children: [
          Icon(Icons.account_balance_wallet_outlined, color: colors.success),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Portefeuille',
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                // Le chargement n'occupe pas la place : un tiret stable vaut
                // mieux qu'un texte qui saute dès que la donnée arrive.
                // Le montant est le sujet, il n'accorde pas de participe : «
                // 12 000 FCFA encaissés » serait faux pour 1 FCFA.
                Text(
                  switch (async) {
                    AsyncData(:final value) =>
                      '${Fmt.money(value.currentMonthAmount)} · '
                          '${value.currentMonthLabel}',
                    AsyncError() => 'Encaissements indisponibles',
                    _ => 'Chargement du relevé…',
                  },
                  style: TextStyle(
                    color: colors.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: colors.onSurfaceVariant),
        ],
      ),
    );
  }
}
