import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Cloche de notifications avec badge de non-lus.
///
/// Partagée par les espaces client et technicien : le point d'entrée est le
/// même, seul le contenu dépend du compte connecté.
class NotificationBell extends StatelessWidget {
  const NotificationBell({super.key, required this.onPressed, this.count = 0});

  final VoidCallback onPressed;

  /// Nombre de notifications non lues. `0` masque le badge.
  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return IconButton(
      tooltip: count == 0 ? 'Notifications' : '$count notification(s) non lue(s)',
      onPressed: onPressed,
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text(count > 99 ? '99+' : '$count'),
        backgroundColor: colors.error,
        child: Icon(Icons.notifications_none_rounded),
      ),
    );
  }
}