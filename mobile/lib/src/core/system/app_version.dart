import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../theme/app_colors.dart';

/// Version de l'application telle qu'elle est installée sur le téléphone.
///
/// Elle est lue sur le paquet installé, et non écrite dans le code. C'était la
/// seule façon d'éviter qu'un numéro affiché mente : les trois écrans qui
/// affichaient la version — la connexion et les deux profils — portaient tous un
/// `1.0.0` écrit à la main, resté vrai pendant que six versions étaient
/// livrées. Android, lui, refuse d'installer par-dessus un `versionCode` qui
/// n'a pas augmenté : un numéro faux ne fait pas que tromper, il fait échouer la
/// mise à jour.
class AppVersion {
  const AppVersion({required this.version, required this.build});

  /// Version lisible, telle qu'écrite dans `pubspec.yaml` (`1.6.0`).
  final String version;

  /// Numéro de compilation, monoton croissant (`7`).
  final String build;

  /// Ce que l'écran affiche.
  ///
  /// Le numéro de compilation n'est montré que s'il existe : sur une
  /// plate-forme qui ne le fournit pas, afficher « 1.6.0 () » serait pire que
  /// de n'afficher que la version.
  String get label => build.isEmpty ? version : '$version ($build)';
}

/// Lecture de la version installée.
///
/// `null` quand la plate-forme ne répond pas — un test, un hôte sans
/// implémentation. Aucun numéro de repli n'est inventé dans ce cas : afficher
/// « 1.0.0 » parce que c'est ce que dit le code serait exactement le défaut que
/// ce fichier corrige. L'écran montre alors le texte sans version.
final appVersionProvider = FutureProvider<AppVersion?>((ref) async {
  try {
    final info = await PackageInfo.fromPlatform();

    return AppVersion(
      version: info.version,
      build: info.buildNumber,
    );
  } catch (_) {
    return null;
  }
});

/// Numéro de version, seul.
///
/// Pour un profil, où une ligne « Version » garde sa place quoi qu'il arrive.
class AppVersionText extends ConsumerWidget {
  const AppVersionText({super.key, this.prefix = 'version '});

  /// Ce qui précède le numéro. La connexion écrit déjà « WiFi Care », le profil
  /// est dans une colonne étiquetée.
  final String prefix;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final version = ref.watch(appVersionProvider).value;

    return Text(
      // La lecture est asynchrone : avant son retour, et quand la plate-forme ne
      // répond pas, le texte reste vide plutôt que de montrer un numéro deviné.
      version == null ? '' : '$prefix${version.label}',
    );
  }
}

/// Pied de page de marque, avec la version installée.
///
/// Sur l'écran de connexion, la version est la seule chose qui distingue deux
/// APK distributions à la même personne — et c'est aussi ce qu'elle demande
/// quand une notification ne se déclenche pas. Elle est donc lisible, en petit
/// mais pas en fraude, sous le reste de l'écran.
class AppVersionFooter extends ConsumerWidget {
  const AppVersionFooter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final version = ref.watch(appVersionProvider).value;

    return Text(
      version == null
          ? '© ${DateTime.now().year} WiFi Care'
          : '© ${DateTime.now().year} WiFi Care — version ${version.label}',
      textAlign: TextAlign.center,
      style: TextStyle(color: colors.onSurfaceVariant, fontSize: 11),
    );
  }
}
