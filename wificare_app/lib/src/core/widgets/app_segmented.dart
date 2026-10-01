import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Sélecteur segmenté aligné sur le thème de l'application.
///
/// Deux segments de largeur égale : contrairement à `SegmentedButton`, la mise
/// en page ne dépend pas de la largeur naturelle des libellés et ne déborde
/// donc jamais sur un écran étroit.
class AppSegmented<T> extends StatelessWidget {
  const AppSegmented({
    super.key,
    required this.value,
    required this.labels,
    required this.onChanged,
  });

  final T value;
  final Map<T, String> labels;
  final ValueChanged<T>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final borderRadius = BorderRadius.circular(AppRadius.md);

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: colors.surfaceVariant,
        borderRadius: borderRadius,
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Row(
        children: [
          for (final entry in labels.entries)
            Expanded(
              child: _Segment(
                label: entry.value,
                selected: entry.key == value,
                enabled: onChanged != null,
                onTap: () => onChanged?.call(entry.key),
              ),
            ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: selected ? colors.surface : Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs + 2,
            ),
            child: Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: selected ? colors.primary : colors.onSurfaceVariant,
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }
}