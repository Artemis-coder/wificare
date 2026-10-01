import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/infra_providers.dart';
import '../data/ticket_repository.dart';

final ticketRepositoryProvider = Provider<TicketRepository>(
  (ref) => TicketRepository(ref.watch(apiClientProvider)),
);
