import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/permissions/permissions_service.dart';
import '../../../core/providers/infra_providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_logo.dart';

/// Écran d'accueil, avant la première connexion.
///
/// Il explique **à quoi servent** les deux autorisations avant de les
/// demander. Ce n'est pas une politeness : Android n'affiche la boîte de
/// dialogue qu'une fois, et un utilisateur qui refuse une fenêtre surgissante
/// sans explication ne la réouvrira jamais. Une demande non motivée se paie
/// ensuite en notifications perdues et en ETA jamais partagées.
///
/// L'écran ne bloque rien : refuser est légitime, et l'application reste
/// pleinement utilisable. Il ne sert qu'à une chose — laisser le choix éclairé,
/// et autoriser plus tard depuis les réglages du téléphone.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key, required this.onDone});

  /// Appelé une fois l'utilisateur passé cette étape, quelle que soit sa
  /// décision. Asynchrone : le drapeau « déjà vu » est écrit avant de
  /// rediriger, pour que l'écran ne réapparaisse pas au démarrage suivant.
  final Future<void> Function() onDone;

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  bool _busy = false;

  /// Ce que l'utilisateur a refusé, à lui redire plus tard.
  LocationGrant? _location;

  Future<void> _ask() async {
    setState(() => _busy = true);

    final push = ref.read(pushServiceProvider);

    // Les notifications d'abord : c'est ce qui prévient d'une nouvelle
    // demande, et cela n'a rien à voir avec la position.
    await PermissionsService.requestNotifications(push: push);

    // Puis la localisation, qui conditionne le partage de position et l'ETA.
    final location = await PermissionsService.requestLocation();

    if (!mounted) return;

    setState(() {
      _location = location;
      _busy = false;
    });

    // On ne retient pas l'utilisateur sur un refus : l'application fonctionne
    // sans, et il peut revenir dans les réglages du téléphone à tout moment.
    if (location.isGranted) await widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final location = _location;
    final refusedForever = location?.deniedForever ?? false;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            const SizedBox(height: AppSpacing.lg),
            const Center(child: AppLogo(size: 72)),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Bienvenue sur ${AppConfig.appName}',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.onSurface,
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Deux autorisations nous permettent de vous prévenir et de vous '
              'situer précisément. Vous pourrez les modifier plus tard dans les '
              'réglages du téléphone.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.onSurfaceVariant,
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            const _PermissionTile(
              icon: Icons.notifications_active_outlined,
              title: 'Notifications',
              body:
                  'Être prévenu d\'une nouvelle demande, d\'un changement de '
                  'statut ou de l\'arrivée du technicien, même application '
                  'fermée.',
            ),
            const SizedBox(height: AppSpacing.sm),
            const _PermissionTile(
              icon: Icons.my_location_rounded,
              title: 'Localisation',
              body:
                  'Partager votre position pour connaître l\'heure d\'arrivée '
                  'du technicien, et voir sur une carte à quelle distance il en '
                  'est. Jamais suivie en continu.',
            ),

            // Un refus définitif ne se rattrape pas avec un bouton qui ne
            // mènera nulle part : il faut les réglages du téléphone.
            if (refusedForever) ...[
              const SizedBox(height: AppSpacing.md),
              AppCard(
                variant: AppCardVariant.filled,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      location!.message,
                      style: TextStyle(
                        color: colors.onSurface,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppButton(
                      label: 'Ouvrir les réglages',
                      icon: Icons.settings_outlined,
                      variant: AppButtonVariant.secondary,
                      onPressed: () => PermissionsService.openSettings(),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: location == null ? 'Autoriser et continuer' : 'Continuer',
              icon: Icons.arrow_forward_rounded,
              loading: _busy,
              onPressed: _busy ? null : () async {
                if (location == null) {
                  await _ask();
                  return;
                }

                await widget.onDone();
              },
            ),
            if (location != null && !location.isGranted) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Sans localisation, l\'heure d\'arrivée du technicien ne pourra '
                'pas être estimée. Le reste de l\'application fonctionne '
                'normalement.',
                textAlign: TextAlign.center,
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
  }
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: colors.primary, size: 24),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  body,
                  style: TextStyle(
                    color: colors.onSurfaceVariant,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
