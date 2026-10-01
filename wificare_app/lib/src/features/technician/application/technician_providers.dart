import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/providers/infra_providers.dart';
import '../../auth/application/auth_controller.dart';
import '../data/technician_repository.dart';

final technicianRepositoryProvider = Provider<TechnicianRepository>(
  (ref) => TechnicianRepository(ref.watch(apiClientProvider)),
);

/// Demandes affectées au technicien connecté, filtrées par statut.
final technicianTicketsProvider = FutureProvider.autoDispose
    .family<List<Ticket>, TicketStatus?>((ref, status) async {
      final technicianId = ref.watch(currentUserProvider)?.id;
      if (technicianId == null) return const <Ticket>[];

      final page = await ref
          .read(technicianRepositoryProvider)
          .myTickets(technicianId: technicianId, status: status);
      return page.items;
    });

/// Compteurs de l'accueil technicien.
final technicianStatsProvider = Provider.autoDispose<TechnicianStats>((ref) {
  final tickets =
      ref.watch(technicianTicketsProvider(null)).value ?? const <Ticket>[];
  return TechnicianStats.from(tickets);
});

/// Répartition des demandes d'un technicien.
class TechnicianStats {
  const TechnicianStats({
    required this.total,
    required this.toDo,
    required this.inProgress,
    required this.done,
  });

  /// Toutes les demandes affectées au technicien.
  final int total;

  /// À prendre en charge : nouvelle, à vérifier ou en attente de rendez-vous.
  final int toDo;

  /// Sur le terrain : en route, diagnostic, devis, réparation, paiement.
  final int inProgress;

  /// Terminées ou clôturées.
  final int done;

  factory TechnicianStats.from(List<Ticket> tickets) {
    const toDoStatuses = {
      TicketStatus.created,
      TicketStatus.toVerify,
      TicketStatus.confirmed,
    };

    const doneStatuses = {
      TicketStatus.completed,
      TicketStatus.closed,
      TicketStatus.canceled,
    };

    var toDo = 0;
    var inProgress = 0;
    var done = 0;

    for (final ticket in tickets) {
      if (doneStatuses.contains(ticket.status)) {
        done++;
      } else if (toDoStatuses.contains(ticket.status)) {
        toDo++;
      } else {
        inProgress++;
      }
    }

    return TechnicianStats(
      total: tickets.length,
      toDo: toDo,
      inProgress: inProgress,
      done: done,
    );
  }
}
