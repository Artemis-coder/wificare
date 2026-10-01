import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/infra_providers.dart';
import '../data/review_repository.dart';

final reviewRepositoryProvider = Provider<ReviewRepository>(
  (ref) => ReviewRepository(ref.watch(apiClientProvider)),
);

/// Avis du client sur ses interventions.
///
/// Mis en cache tant qu'un écran l'observe : la liste ne bouge que lorsque le
/// client dépose un avis, ou qu'il en enregistre un autre.
final reviewsProvider = FutureProvider.autoDispose<List<Review>>(
  (ref) => ref.watch(reviewRepositoryProvider).list(),
);