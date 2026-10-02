import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../application/review_providers.dart';
import '../data/review_repository.dart';

/// Avis laissés par le client sur ses interventions.
///
/// Chaque avis reste rattaché à l'intervention qu'il juge : sans ce lien, un
/// avis isolé ne dit rien du travail effectué.
class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(reviewsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mes avis')),
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
                    'Une fois une intervention terminée, vous pouvez juger le travail réalisé.',
              );
            }

            final average = reviews.fold<int>(0, (sum, r) => sum + r.rating) /
                reviews.length;

            return ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                _Summary(average: average, count: reviews.length),
                const SizedBox(height: AppSpacing.md),
                for (final review in reviews) ...[
                  _ReviewCard(review: review),
                  const SizedBox(height: AppSpacing.md),
                ],
              ],
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

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});

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
          if (review.technicianName != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Technicien : ${review.technicianName}',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
            ),
          ],
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

/// Étoiles d'une note sur 5.
///
/// Une demi-étoile n'est pas représentable sans police dédiée : la note est
/// arrondie à l'entier le plus proche, l'affichage reste ainsi lisible.
class StarRating extends StatelessWidget {
  const StarRating({super.key, required this.rating, this.size = 16});

  final double rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final rounded = rating.round().clamp(0, 5);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var index = 1; index <= 5; index++)
          Icon(
            index <= rounded ? Icons.star_rounded : Icons.star_outline_rounded,
            size: size,
            color: index <= rounded ? colors.warning : colors.outline,
          ),
      ],
    );
  }
}