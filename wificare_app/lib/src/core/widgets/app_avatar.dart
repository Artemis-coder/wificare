import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Avatar image ou initiales.
///
/// La couleur de repli est dérivée du nom de façon **déterministe** : la liste
/// d'index est fixe, donc plus de `undefined` possible (bug latent de
/// l'ancienne version React Native).
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.size = 48,
    this.borderRadius,
  });

  final String name;
  final String? imageUrl;
  final double size;
  final BorderRadius? borderRadius;

  static const List<Color> _palette = [
    Color(0xFF0D9488),
    Color(0xFF3B82F6),
    Color(0xFF8B5CF6),
    Color(0xFFEC4899),
    Color(0xFFF59E0B),
    Color(0xFF10B981),
    Color(0xFFEF4444),
    Color(0xFF6366F1),
  ];

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.take(2).toString().toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }

  Color get _color {
    var hash = 0;
    for (final unit in name.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    return _palette[hash % _palette.length];
  }

  @override
  Widget build(BuildContext context) {
    final shape = borderRadius ?? BorderRadius.circular(AppRadius.full);
    final url = imageUrl;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: url == null || url.isEmpty ? _color : Colors.transparent,
        borderRadius: shape,
      ),
      clipBehavior: Clip.antiAlias,
      child: url == null || url.isEmpty
          ? Center(
              child: Text(
                _initials,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: size * 0.36,
                  fontWeight: FontWeight.w700,
                ),
              ),
            )
          : CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              placeholder: (_, _) => ColoredBox(color: context.colors.surfaceVariant),
              errorWidget: (_, _, _) => Center(
                child: Text(
                  _initials,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: size * 0.36,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
    );
  }
}
