import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../auth/application/auth_controller.dart';
import 'ticket_providers.dart';

/// Tickets du client connecté, filtrés par statut (null = tous).
final ticketListProvider = FutureProvider.autoDispose
    .family<List<Ticket>, TicketStatus?>((ref, status) async {
      final clientId = ref.watch(clientAccountProvider)?.id;
      if (clientId == null) return const <Ticket>[];

      final page = await ref
          .read(ticketRepositoryProvider)
          .list(clientId: clientId, status: status, limit: 100);
      return page.items;
    });

/// Compteurs du tableau de bord.
final ticketStatsProvider = Provider.autoDispose<TicketStats>((ref) {
  final tickets = ref.watch(ticketListProvider(null)).value ?? const <Ticket>[];
  return TicketStats.from(tickets);
});

class TicketStats {
  const TicketStats({
    required this.open,
    required this.inProgress,
    required this.resolved,
    required this.total,
  });

  final int open;
  final int inProgress;
  final int resolved;
  final int total;

  factory TicketStats.from(List<Ticket> tickets) {
    const inProgressStatuses = {
      TicketStatus.assigned,
      TicketStatus.confirmed,
      TicketStatus.enRoute,
      TicketStatus.diagnosing,
      TicketStatus.pendingQuote,
      TicketStatus.repairing,
      TicketStatus.pendingPayment,
    };

    var open = 0;
    var inProgress = 0;
    var resolved = 0;

    for (final ticket in tickets) {
      if (inProgressStatuses.contains(ticket.status)) {
        inProgress++;
      } else if (ticket.status.isOpen) {
        open++;
      } else {
        resolved++;
      }
    }

    return TicketStats(
      open: open,
      inProgress: inProgress,
      resolved: resolved,
      total: tickets.length,
    );
  }
}
