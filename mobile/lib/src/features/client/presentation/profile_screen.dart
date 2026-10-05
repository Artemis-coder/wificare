import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/router/app_router.dart';
import '../../../core/system/app_version.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_avatar.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../../notifications/application/notification_providers.dart';



/// Profil du client connecté.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _openUrl(BuildContext context, Uri uri, String failureMessage) async {
    try {
      final ok = await launchUrl(uri);
      if (!ok && context.mounted) {
        showAppSnackBar(context, failureMessage, isError: true);
      }
    } catch (_) {
      if (context.mounted) showAppSnackBar(context, failureMessage, isError: true);
    }
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final confirmed = await confirmDialog(
      context,
      title: 'Déconnexion',
      message: 'Voulez-vous vraiment vous déconnecter de votre compte ?',
      confirmLabel: 'Oui',
      cancelLabel: 'Non',
      destructive: true,
    );
    if (!confirmed) return;
    await ref.read(authControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final user = ref.watch(currentUserProvider);
    final zones = ref.watch(clientAccountProvider)?.zones ?? const [];

    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Profil')),
        body: const SafeArea(
          child: EmptyState(
            title: 'Profil indisponible',
            message: 'Reconnectez-vous pour afficher vos informations.',
            icon: Icons.person_off_outlined,
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.read(authControllerProvider.notifier).refreshProfile(),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              Center(
                child: Column(
                  children: [
                    AppAvatar(name: user.displayName, size: 80),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      user.displayName,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      user.phone,
                      style: TextStyle(color: colors.onSurfaceVariant, fontSize: 14),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppBadge(label: user.role.label),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Informations du compte'),
              AppCard(
                child: Column(
                  children: [
                    InfoRow(
                      label: 'Téléphone',
                      value: user.phone,
                      icon: Icons.phone_outlined,
                      onTap: () => _openUrl(
                        context,
                        Uri(scheme: 'tel', path: user.phone),
                        'Impossible d\'appeler ce numéro.',
                      ),
                    ),
                    const Divider(),
                    InfoRow(label: 'Rôle', value: user.role.label),
                    const Divider(),
                    InfoRow(label: 'Statut', value: user.status.label),
                    const Divider(),
                    InfoRow(label: 'Identifiant utilisateur', value: user.id),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Mes zones Wi-Fi'),
              AppCard(
                child: zones.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                        child: Text(
                          'Aucune zone Wi-Fi associée à votre compte.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: colors.onSurfaceVariant,
                            fontSize: 13,
                          ),
                        ),
                      )
                    : Column(
                        children: [
                          for (var i = 0; i < zones.length; i++) ...[
                            if (i > 0) const Divider(),
                            InfoRow(
                              label: 'Zone ${i + 1}',
                              value: zones[i].name,
                              icon: Icons.router_outlined,
                            ),
                            Padding(
                              padding: const EdgeInsets.only(
                                left: 26,
                                bottom: AppSpacing.sm,
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.location_on_outlined,
                                    size: 15,
                                    color: colors.onSurfaceVariant,
                                  ),
                                  const SizedBox(width: AppSpacing.xs),
                                  Expanded(
                                    child: Text(
                                      zones[i].location,
                                      style: TextStyle(
                                        color: colors.onSurfaceVariant,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Paramètres'),
              AppCard(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Column(
                  children: [
                    _SoonTile(icon: Icons.palette_outlined, label: 'Thème'),
                    const Divider(),
                    _SoonTile(
                      icon: Icons.lock_outline_rounded,
                      label: 'Changer le mot de passe',
                    ),
                    const Divider(),
                    _NotificationsTile(),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'À propos'),
              AppCard(
                child: Column(
                  children: [
                    InfoRow(label: 'Application', value: 'WiFi Care Client'),
                    const Divider(),
                    InfoRow(label: 'Version', valueWidget: const AppVersionText()),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        Icons.support_agent_outlined,
                        color: colors.onSurfaceVariant,
                      ),
                      title: Text(
                        'Contacter le support',
                        style: TextStyle(color: colors.onSurface, fontSize: 14),
                      ),
                      subtitle: Text(
                        AppConfig.supportEmail,
                        style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                      ),
                      trailing: Icon(
                        Icons.chevron_right_rounded,
                        color: colors.onSurfaceVariant,
                      ),
                      onTap: () => _openUrl(
                        context,
                        Uri(scheme: 'mailto', path: AppConfig.supportEmail),
                        'Aucune application de messagerie disponible.',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: 'Se déconnecter',
                icon: Icons.logout_rounded,
                variant: AppButtonVariant.destructive,
                onPressed: () => _logout(context, ref),
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}

/// Accès à l'historique des notifications, avec le nombre de non-lus.
class _NotificationsTile extends ConsumerWidget {
  const _NotificationsTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final unread = ref.watch(unreadCountProvider);

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      leading: Icon(Icons.notifications_none_rounded, color: colors.onSurface),
      title: Text(
        'Notifications',
        style: TextStyle(color: colors.onSurface, fontSize: 14),
      ),
      subtitle: Text(
        unread == 0
            ? 'Aucune notification non lue'
            : '$unread notification(s) non lue(s)',
        style: TextStyle(
          color: unread == 0 ? colors.onSurfaceVariant : colors.primary,
          fontSize: 12,
        ),
      ),
      trailing: Icon(Icons.chevron_right_rounded, color: colors.onSurfaceVariant),
      onTap: () => context.push(Routes.notifications),
    );
  }
}

/// Tuile de réglage non encore disponible.
class _SoonTile extends StatelessWidget {
  const _SoonTile({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final disabled = colors.neutralVariant;

    return ListTile(
      enabled: false,
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      leading: Icon(icon, color: disabled),
      title: Text(
        label,
        style: TextStyle(color: colors.onSurfaceVariant, fontSize: 14),
      ),
      subtitle: Text(
        'Bientôt disponible',
        style: TextStyle(color: disabled, fontSize: 12),
      ),
      trailing: Icon(Icons.chevron_right_rounded, color: disabled),
      onTap: null,
    );
  }
}
