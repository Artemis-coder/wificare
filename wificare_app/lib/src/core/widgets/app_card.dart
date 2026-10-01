import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

enum AppCardVariant { elevated, outlined, filled }

class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.variant = AppCardVariant.outlined,
    this.padding = const EdgeInsets.all(AppSpacing.md),
    this.onTap,
    this.borderColor,
  });

  final Widget child;
  final AppCardVariant variant;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// Contour personnalisé (carte sélectionnée), sinon `outlineVariant`.
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    final borderRadius = BorderRadius.circular(AppRadius.lg);
    final decoration = BoxDecoration(
      color: variant == AppCardVariant.filled ? colors.surfaceVariant : colors.surface,
      borderRadius: borderRadius,
      border: variant == AppCardVariant.filled
          ? null
          : Border.all(color: borderColor ?? colors.outlineVariant),
      boxShadow: variant == AppCardVariant.elevated ? AppShadows.md : null,
    );

    return DecoratedBox(
      decoration: decoration,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: borderRadius,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

class AppCardHeader extends StatelessWidget {
  const AppCardHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

class AppCardFooter extends StatelessWidget {
  const AppCardFooter({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: child,
    );
  }
}
