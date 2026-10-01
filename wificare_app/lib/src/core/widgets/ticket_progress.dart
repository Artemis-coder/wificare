import 'package:flutter/material.dart';

import '../domain/enums.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Suivi de progression du ticket côté client (6 étapes).
///
/// L'implémentation verticale est volontairement simple et lisible : cercle
/// rempli / vide + trait de liaison, sans dépendance à un paquet d'animation.
class TicketProgressTracker extends StatelessWidget {
  const TicketProgressTracker({super.key, required this.status});

  final TicketStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final currentIndex = status.progressIndex;
    final isDone = status == TicketStatus.closed;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < TicketStatus.clientProgressSteps.length; i++)
          _Step(
            step: TicketStatus.clientProgressSteps[i],
            isDone: currentIndex > i || isDone,
            isCurrent: currentIndex == i,
            isLast: i == TicketStatus.clientProgressSteps.length - 1,
            color: TicketStatus.clientProgressSteps[i].color,
            lineColor: currentIndex > i
                ? TicketStatus.clientProgressSteps[i].color
                : colors.outlineVariant,
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.step,
    required this.isDone,
    required this.isCurrent,
    required this.isLast,
    required this.color,
    required this.lineColor,
  });

  final TicketStatus step;
  final bool isDone;
  final bool isCurrent;
  final bool isLast;
  final Color color;
  final Color lineColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final reached = isDone || isCurrent;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: reached ? color : colors.surfaceVariant,
                  shape: BoxShape.circle,
                  border: Border.all(color: reached ? color : colors.outlineVariant, width: 2),
                ),
                child: reached
                    ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
                    : null,
              ),
              if (!isLast)
                Expanded(
                  child: Container(width: 2, color: lineColor),
                ),
            ],
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.md),
              child: Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  step.label,
                  style: TextStyle(
                    color: reached ? colors.onSurface : colors.onSurfaceVariant,
                    fontSize: 14,
                    fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
          if (isCurrent)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text(
                'En cours',
                style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ),
        ],
      ),
    );
  }
}

/// Notation par étoiles (saisie et lecture seule).
class StarRating extends StatelessWidget {
  const StarRating({
    super.key,
    required this.rating,
    this.onChanged,
    this.size = 32,
  });

  final int rating;
  final ValueChanged<int>? onChanged;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final value = index + 1;
        final filled = value <= rating;

        return IconButton(
          onPressed: onChanged == null ? null : () => onChanged!(value),
          icon: Icon(
            filled ? Icons.star_rounded : Icons.star_border_rounded,
            size: size,
            color: filled ? colors.secondary : colors.onSurfaceVariant,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 2),
          constraints: const BoxConstraints(),
          tooltip: onChanged == null ? null : '$value étoile${value > 1 ? 's' : ''}',
        );
      }),
    );
  }
}
