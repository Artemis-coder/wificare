import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/models.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/exclusive_filter_bar.dart';
import '../../../core/widgets/states.dart';
import '../application/technician_providers.dart';
import '../domain/technician_filter.dart';

/// Demandes affectées au technicien, filtrables par groupe de statuts.
class TechnicianTicketsScreen extends ConsumerStatefulWidget {
  const TechnicianTicketsScreen({super.key});

  @override
  ConsumerState<TechnicianTicketsScreen> createState() =>
      _TechnicianTicketsScreenState();
}

class _TechnicianTicketsScreenState
    extends ConsumerState<TechnicianTicketsScreen> {
  TechnicianFilter _filter = TechnicianFilter.all;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final asyncTickets = ref.watch(technicianTicketsProvider(null));
    final stats = ref.watch(technicianStatsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Demandes assignées')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              0,
              AppSpacing.md,
              AppSpacing.md,
            ),
            child: Row(
              children: [
                Expanded(
                  child: StatTile(
                    label: 'À traiter',
                    value: '${stats.toDo}',
                    icon: Icons.assignment_late_outlined,
                    color: colors.warning,
                    onTap: () =>
                        setState(() => _filter = TechnicianFilter.toDo),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: StatTile(
                    label: 'En cours',
                    value: '${stats.inProgress}',
                    icon: Icons.handyman_outlined,
                    color: colors.secondary,
                    onTap: () =>
                        setState(() => _filter = TechnicianFilter.inProgress),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: StatTile(
                    label: 'Terminées',
                    value: '${stats.done}',
                    icon: Icons.task_alt_rounded,
                    color: colors.success,
                    onTap: () =>
                        setState(() => _filter = TechnicianFilter.done),
                  ),
                ),
              ],
            ),
          ),
          ExclusiveFilterBar<TechnicianFilter>(
            items: TechnicianFilter.values,
            selected: _filter,
            labelOf: (value) => value.label,
            onChanged: (value) => setState(() => _filter = value),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () =>
                  ref.refresh(technicianTicketsProvider(null).future),
              child: asyncTickets.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => ListView(
                  children: [
                    SizedBox(
                      height: 380,
                      child: ErrorView(
                        error: error,
                        onRetry: () =>
                            ref.invalidate(technicianTicketsProvider(null)),
                      ),
                    ),
                  ],
                ),
                data: (all) {
                  final tickets = all
                      .where((ticket) => _filter.matches(ticket.status))
                      .toList();

                  if (tickets.isEmpty) {
                    return ListView(
                      children: [
                        SizedBox(
                          height: 380,
                          child: EmptyState(
                            icon: Icons.assignment_outlined,
                            title: _filter == TechnicianFilter.all
                                ? 'Aucune demande assignée'
                                : 'Aucune demande dans ce groupe',
                            message: _filter == TechnicianFilter.all
                                ? 'Les demandes qui vous sont affectées apparaîtront ici.'
                                : 'Changez de filtre pour voir vos autres interventions.',
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
                    separatorBuilder: (_, _) =>
                        const SizedBox(height: AppSpacing.sm),
                    itemBuilder: (context, index) {
                      final ticket = tickets[index];
                      return _TicketCard(
                        ticket: ticket,
                        onTap: () => context.push(
                          '${TechnicianRoutes.tickets}/${ticket.id}',
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

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.onTap});

  final Ticket ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      onTap: onTap,
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
          // Côté technicien, l'interlocuteur est le client : il ne gère pas
          // les zones, il s'y rend pour intervenir.
          _MetaLine(
            icon: Icons.person_outline_rounded,
            text: ticket.client?.name ?? 'Client inconnu',
            secondary: ticket.client?.contact,
          ),
          const SizedBox(height: AppSpacing.xs),
          _MetaLine(
            icon: Icons.router_outlined,
            text: ticket.zoneName,
            secondary: ticket.zoneLocation.isEmpty ? null : ticket.zoneLocation,
          ),
          const SizedBox(height: AppSpacing.xs),
          _MetaLine(
            icon: Icons.schedule_rounded,
            text: Fmt.relativeDay(ticket.createdAt),
          ),
        ],
      ),
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
