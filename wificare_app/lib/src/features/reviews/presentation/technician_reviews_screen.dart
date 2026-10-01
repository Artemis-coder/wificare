import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../application/review_providers.dart';
import '../data/review_repository.dart';
import 'reviews_screen.dart' show StarRating;

/// Avis laissés par les clients sur les interventions du technicien.
///
/// Lecture seule : le technicien subit la note, il ne la redacte pas. Le
/// serveur ne lui ouvre d'ailleurs que les avis qui le concernent — sans ce
/// filtre, il pourrait lire ce que les clients ont pensé d'un collègue.
class TechnicianReviewsScreen extends ConsumerWidget {
  const TechnicianReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(reviewsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Avis reçus')),
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorView(
            error: error,
            onRetry: () => ref.invalidate(reviewsProvider),
          ),
          data: (reviews) {
            if (reviews.isEmpty) {
              return const EmptyState(
                icon: Icons.star_outline_rounded,
                title: 'Aucun avis pour le moment',
                message:
                    'Une fois une intervention terminée et validée par le client, son avis apparaîtra ici.',
              );
            }

            final average =
                reviews.fold<int>(0, (sum, r) => sum + r.rating) /
                reviews.length;

            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(reviewsProvider),
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  _Summary(average: average, count: reviews.length),
                  const SizedBox(height: AppSpacing.md),
                  for (final review in reviews) ...[
                    _ReceivedCard(review: review),
                    const SizedBox(height: AppSpacing.md),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.average, required this.count});

  final double average;
  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Note moyenne',
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
              Text(
                average.toStringAsFixed(1).replaceAll('.', ','),
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              Text(
                '$count avis',
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
            ],
          ),
          const Spacer(),
          StarRating(rating: average, size: 18),
        ],
      ),
    );
  }
}

class _ReceivedCard extends StatelessWidget {
  const _ReceivedCard({required this.review});

  final Review review;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  review.ticketReference,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              Text(
                Fmt.date(review.createdAt),
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
            ],
          ),
          Text(
            '${review.zoneName} · ${review.ticketType}',
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
          ),
          const SizedBox(height: AppSpacing.sm),
          StarRating(rating: review.rating.toDouble()),
          if (review.comment != null && review.comment!.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              review.comment!,
              style: TextStyle(color: colors.onSurface, fontSize: 14),
            ),
          ],
        ],
      ),
    );
  }
}