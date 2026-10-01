import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Logo de la plateforme WiFi Care.
///
/// L'image fournie est un carré plein : l'arrondi est donc appliqué par le
/// widget, pour que la marque garde le même aspect sur l'écran de connexion,
/// le splash et les en-têtes, quel que soit le fond derrière.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 72});

  final double size;

  static const String asset = 'assets/logo/logo_wificare.png';

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.xl),
      child: Image.asset(
        asset,
        width: size,
        height: size,
        fit: BoxFit.cover,
        // Le logo est décodé en mémoire : le décoder à chaque construction
        // d'écran ferait clignoter l'image sur les bas de gamme.
        filterQuality: FilterQuality.medium,
      ),
    );
  }
}
