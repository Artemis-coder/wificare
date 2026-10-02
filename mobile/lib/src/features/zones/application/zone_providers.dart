import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/infra_providers.dart';
import '../data/zone_repository.dart';

final zoneRepositoryProvider = Provider<ZoneRepository>(
  (ref) => ZoneRepository(ref.watch(apiClientProvider)),
);
