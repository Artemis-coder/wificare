import 'package:flutter/material.dart';

import '../domain/enums.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

enum AppBadgeTone {
  primary,
  secondary,
  success,
  warning,
  error,
  info,
  neutral,
}

/// Pastille générique.
class AppBadge extends StatelessWidget {
  const AppBadge({
    super.key,
    required this.label,
    this.tone = AppBadgeTone.primary,
    this.color,
    this.dot = false,
    this.dense = false,
  });

  final String label;
  final AppBadgeTone tone;
  final Color? color;
  final bool dot;
  final bool dense;

  static const Map<AppBadgeTone, Color> _tones = {
    AppBadgeTone.primary: Color(0xFF0D9488),
    AppBadgeTone.secondary: Color(0xFFD97706),
    AppBadgeTone.success: Color(0xFF22C55E),
    AppBadgeTone.warning: Color(0xFFF59E0B),
    AppBadgeTone.error: Color(0xFFDC2626),
    AppBadgeTone.info: Color(0xFF3B82F6),
    AppBadgeTone.neutral: Color(0xFF64748B),
  };

  @override
  Widget build(BuildContext context) {
    final base = color ?? _tones[tone]!;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? AppSpacing.sm : 10,
        vertical: dense ? 2 : 4,
      ),
      decoration: BoxDecoration(
        color: base.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: base.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: base, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              color: base,
              fontSize: dense ? 11 : 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Pastille sémantique : un seul composant pilote le vocabulaire couleur de
/// l'application (statuts de ticket, priorités, paiements, documents).
class StatusBadge extends StatelessWidget {
  const StatusBadge.ticket(this.ticket, {super.key, this.dense = false})
    : priority = null,
      payment = null,
      document = null;

  const StatusBadge.priority(this.priority, {super.key, this.dense = true})
    : ticket = null,
      payment = null,
      document = null;

  const StatusBadge.payment(this.payment, {super.key, this.dense = false})
    : ticket = null,
      priority = null,
      document = null;

  const StatusBadge.document(this.document, {super.key, this.dense = false})
    : ticket = null,
      priority = null,
      payment = null;

  final TicketStatus? ticket;
  final Priority? priority;
  final PaymentStatus? payment;
  final DocumentStatus? document;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    if (ticket != null) {
      return AppBadge(
        label: ticket!.label,
        color: ticket!.color,
        dot: true,
        dense: dense,
      );
    }

    if (priority != null) {
      return AppBadge(
        label: priority!.label,
        color: priority!.color,
        dot: true,
        dense: dense,
      );
    }

    if (payment != null) {
      final color = switch (payment!) {
        PaymentStatus.completed => colors.success,
        PaymentStatus.pending => colors.warning,
        PaymentStatus.failed => colors.error,
        PaymentStatus.refunded => colors.neutral,
      };
      return AppBadge(label: payment!.label, color: color, dense: dense);
    }

    final color = switch (document!) {
      DocumentStatus.paid => colors.success,
      DocumentStatus.accepted => colors.info,
      DocumentStatus.sent => colors.primary,
      DocumentStatus.draft => colors.neutral,
      DocumentStatus.rejected => colors.error,
    };
    return AppBadge(label: document!.label, color: color, dense: dense);
  }
}
