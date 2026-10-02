import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Barre de filtres exclusive : un seul groupe actif à la fois.
///
/// `FilterBar` sert plutôt aux filtres facultatifs (tous / un statut), où
/// décocher le filtre actif revient à « tous ». Ici les quatre groupes sont
/// toujours complémentaires : aucun n'est « vide », donc la désélection n'a
/// pas de sens.
class ExclusiveFilterBar<T> extends StatelessWidget {
  const ExclusiveFilterBar({
    super.key,
    required this.items,
    required this.selected,
    required this.labelOf,
    required this.onChanged,
  });

  final List<T> items;
  final T selected;
  final String Function(T) labelOf;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final item = items[index];
          final isSelected = item == selected;

          return ChoiceChip(
            label: Text(labelOf(item)),
            selected: isSelected,
            onSelected: (_) => onChanged(item),
            showCheckmark: false,
            labelStyle: TextStyle(
              color: isSelected ? colors.onPrimary : colors.onSurface,
              fontSize: 13,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            ),
            selectedColor: colors.primary,
            backgroundColor: colors.surface,
            side: BorderSide(
              color: isSelected ? colors.primary : colors.outlineVariant,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.full),
            ),
          );
        },
      ),
    );
  }
}
