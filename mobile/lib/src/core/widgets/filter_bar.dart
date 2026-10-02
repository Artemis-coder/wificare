import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Barre de filtres horizontale (statuts de ticket, documents, paiements).
class FilterBar<T> extends StatelessWidget {
  const FilterBar({
    super.key,
    required this.items,
    required this.selected,
    required this.labelOf,
    required this.onChanged,
    this.padding = const EdgeInsets.symmetric(horizontal: AppSpacing.md),
  });

  final List<T?> items;
  final T? selected;
  final String Function(T?) labelOf;
  final ValueChanged<T?> onChanged;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: padding,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final item = items[index];
          final isSelected = item == selected;
          final accent = item is Color ? item : colors.primary;

          return FilterChip(
            label: Text(labelOf(item)),
            selected: isSelected,
            onSelected: (_) => onChanged(isSelected ? null : item),
            showCheckmark: false,
            labelStyle: TextStyle(
              color: isSelected ? colors.onPrimary : colors.onSurface,
              fontSize: 13,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            ),
            backgroundColor: colors.surface,
            selectedColor: accent,
            side: BorderSide(color: isSelected ? accent : colors.outlineVariant),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          );
        },
      ),
    );
  }
}
