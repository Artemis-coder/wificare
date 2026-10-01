import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/models.dart';
import '../../../core/providers/infra_providers.dart';
import '../data/ticket_repository.dart';

final ticketRepositoryProvider = Provider<TicketRepository>(
  (ref) => TicketRepository(ref.watch(apiClientProvider)),
);

/// Détail d'une demande, rechargé au besoin.
///
/// `autoDispose` : une demande fermée n'est plus lue par personne, et son cache
/// ne doit pas survivre à la page.
final ticketDetailProvider =
    FutureProvider.autoDispose.family<Ticket, String>(
  (ref, id) => ref.read(ticketRepositoryProvider).byId(id),
);
