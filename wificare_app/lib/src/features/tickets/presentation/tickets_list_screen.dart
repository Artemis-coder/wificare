import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/enums.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_avatar.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/filter_bar.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../application/ticket_queries.dart';

/// Liste des demandes d'intervention du client, filtrable par statut.
class TicketsListScreen extends ConsumerStatefulWidget {
  const TicketsListScreen({super.key});

  @override
  ConsumerState<TicketsListScreen> createState() => _TicketsListScreenState();
}

class _TicketsListScreenState extends ConsumerState<TicketsListScreen> {
  TicketStatus? _status;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final user = ref.watch(currentUserProvider);
    final asyncTickets = ref.watch(ticketListProvider(_status));
    final stats = ref.watch(ticketStatsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes pannes'),
        actions: [
          IconButton(
            tooltip: 'Nouvelle demande',
            onPressed: () => context.push('/home/tickets/new'),
            icon: const Icon(Icons.add_circle_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              0,
              AppSpacing.md,
              AppSpacing.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bonjour ${user?.displayName ?? ''}',
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
                ),
                const SizedBox(height: AppSpacing.md),
                _TicketKpis(stats: stats),
              ],
            ),
          ),
          FilterBar<TicketStatus?>(
            items: [null, ...TicketStatus.values],
            selected: _status,
            labelOf: (value) => value?.label ?? 'Tous',
            onChanged: (value) => setState(() => _status = value),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(ticketListProvider(_status).future),
              child: asyncTickets.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => ListView(
                  children: [
                    SizedBox(
                      height: 380,
                      child: ErrorView(
                        error: error,
                        onRetry: () => ref.invalidate(ticketListProvider(_status)),
                      ),
                    ),
                  ],
                ),
                data: (tickets) {
                  if (tickets.isEmpty) {
                    return ListView(
                      children: [
                        SizedBox(
                          height: 380,
                          child: EmptyState(
                            icon: Icons.check_circle_outline_rounded,
                            title: _status == null
                                ? 'Aucune demande enregistrée'
                                : 'Aucune demande dans cet état',
                            message: _status == null
                                ? 'Signalez une panne pour suivre son traitement en temps réel.'
                                : 'Changez de filtre pour voir vos autres demandes.',
                            action: _status == null
                                ? AppButtonList(
                                    label: 'Signaler une panne',
                                    icon: Icons.add_rounded,
                                    onTap: () => context.push('/home/tickets/new'),
                                  )
                                : null,
                          ),
                        ),
                      ],
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.md,
                      AppSpacing.sm,
                      AppSpacing.md,
                      AppSpacing.xxl,
                    ),
                    itemCount: tickets.length,
                    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
                    itemBuilder: (context, index) {
                      final ticket = tickets[index];
                      return AppCard(
                        onTap: () => context.push('/home/tickets/${ticket.id}'),
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
                            _MetaLine(
                              icon: Icons.wifi_tethering_rounded,
                              text: ticket.zoneName,
                              secondary: ticket.zoneLocation.isEmpty
                                  ? null
                                  : ticket.zoneLocation,
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            _MetaLine(
                              icon: Icons.schedule_rounded,
                              text: Fmt.relativeDay(ticket.createdAt),
                            ),
                            if (ticket.description != null) ...[
                              const SizedBox(height: AppSpacing.xs),
                              Text(
                                ticket.description!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: colors.onSurfaceVariant,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                            if (ticket.technician != null) ...[
                              const SizedBox(height: AppSpacing.sm),
                              Row(
                                children: [
                                  AppAvatar(name: ticket.technician!.displayName, size: 24),
                                  const SizedBox(width: AppSpacing.sm),
                                  Expanded(
                                    child: Text(
                                      'Technicien : ${ticket.technician!.displayName}',
                                      style: TextStyle(
                                        color: colors.onSurfaceVariant,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bandeau d'indicateurs : total, en cours, traités.
class _TicketKpis extends StatelessWidget {
  const _TicketKpis({required this.stats});

  final TicketStats stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Row(
      children: [
        Expanded(
          child: StatTile(
            label: 'Signalées',
            value: '${stats.total}',
            icon: Icons.inbox_rounded,
            color: colors.info,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: StatTile(
            label: 'En cours',
            value: '${stats.inProgress}',
            icon: Icons.pending_actions_rounded,
            color: colors.secondary,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: StatTile(
            label: 'Traitées',
            value: '${stats.resolved}',
            icon: Icons.check_circle_outline_rounded,
            color: colors.success,
          ),
        ),
      ],
    );
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({required this.icon, required this.text, this.secondary});

  final IconData icon;
  final String text;
  final String? secondary;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Row(
      children: [
        Icon(icon, size: 15, color: colors.onSurfaceVariant),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            secondary == null ? text : '$text · $secondary',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

/// Petit bouton utilisé comme action dans un état vide.
class AppButtonList extends StatelessWidget {
  const AppButtonList({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: onTap,
      icon: Icon(icon ?? Icons.arrow_forward_rounded, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      ),
    );
  }
}
