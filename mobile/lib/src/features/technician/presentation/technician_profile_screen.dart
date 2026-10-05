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
import '../application/availability_controller.dart';
import '../application/technician_providers.dart';

/// Profil du technicien.
///
/// Volontairement différent du profil client : pas de zone Wi-Fi ni
/// d'équipement — le technicien n'en gère pas. On y trouve son activité.
class TechnicianProfileScreen extends ConsumerWidget {
  const TechnicianProfileScreen({super.key});

  Future<void> _openUrl(
    BuildContext context,
    Uri uri,
    String failureMessage,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(failureMessage),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  /// Bascule la disponibilité depuis le profil.
  ///
  /// Le geste est demandé avant d'être exécuté : se mettre en ligne engage à
  /// répondre, et une disponibilité posée par erreur ferait au technicien
  /// attendre des demandes qu'il ne peut pas prendre. Retirer, en revanche, ne
  /// coûte rien à personne et n'est pas demandé.
  Future<void> _toggleAvailability(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final state = ref.read(availabilityProvider);

    if (state.isOnline) {
      await ref.read(availabilityProvider.notifier).setOnline(false);
      return;
    }

    final confirmed = await confirmDialog(
      context,
      title: 'Se mettre en ligne ?',
      message:
          'Vous recevrez les demandes qui se présentent, sur ce téléphone et '
          'dans l\'application. Vous pourrez en refuser une si elle ne vous '
          'convient pas.',
      confirmLabel: 'Se mettre en ligne',
      cancelLabel: 'Plus tard',
    );

    if (!confirmed) return;

    await ref.read(availabilityProvider.notifier).setOnline(true);
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

    // Se déconnecter, c'est aussi se retirer du circuit de répartition.
    // La disponibilité est volontairement durable — elle survit à la fermeture de
    // l'application, pour un technicien en tournée — mais une session close ne
    // répond plus à rien. Laisser le compte en ligne ferait porter les demandes
    // à un téléphone qui ne les verra jamais, et la première d'entre elles
    // resterait retenue chez lui.
    //
    // L'appel précède la destruction de la session, pour la même raison que le
    // jeton de push : le serveur doit encore reconnaître l'appelant.
    if (ref.read(availabilityProvider).isOnline) {
      await ref.read(availabilityProvider.notifier).setOnline(false);
    }

    await ref.read(authControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final user = ref.watch(currentUserProvider);
    final stats = ref.watch(technicianStatsProvider);
    final unread = ref.watch(unreadCountProvider);

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
          onRefresh: () async {
            await ref.read(authControllerProvider.notifier).refreshProfile();
            ref.invalidate(technicianTicketsProvider);
          },
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
                      style: TextStyle(
                        color: colors.onSurfaceVariant,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppBadge(label: user.role.label),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Mon activité'),
              Row(
                children: [
                  Expanded(
                    child: StatTile(
                      label: 'Total assigné',
                      value: '${stats.total}',
                      icon: Icons.inbox_rounded,
                      color: colors.info,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: StatTile(
                      label: 'Terminées',
                      value: '${stats.done}',
                      icon: Icons.task_alt_rounded,
                      color: colors.success,
                    ),
                  ),
                ],
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
                    // La disponibilité est reprise ici, et pas seulement sur
                    // l'accueil : c'est le réglage le pluseasy à vouloir
                    // retrouver quand on ne sait plus pourquoi aucune demande
                    // n'arrive. Y mettre un simple lien laisserait la question
                    // sans réponse.
                    InfoRow(
                      label: 'Disponibilité',
                      value: _availabilityLabel(ref.watch(availabilityProvider)),
                      icon: Icons.wifi_tethering_rounded,
                      onTap: () => _toggleAvailability(context, ref),
                    ),
                    const Divider(),
                    InfoRow(label: 'Identifiant', value: user.id),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'À propos'),
              AppCard(
                child: Column(
                  children: [
                    InfoRow(
                      label: 'Application',
                      value: 'WiFi Care Technicien',
                    ),
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
                        style: TextStyle(
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                        ),
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
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        Icons.notifications_none_rounded,
                        color: colors.onSurface,
                      ),
                      title: Text(
                        'Notifications',
                        style: TextStyle(color: colors.onSurface, fontSize: 14),
                      ),
                      subtitle: Text(
                        unread == 0
                            ? 'Aucune notification non lue'
                            : '$unread notification(s) non lue(s)',
                        style: TextStyle(
                          color: unread == 0
                              ? colors.onSurfaceVariant
                              : colors.primary,
                          fontSize: 12,
                        ),
                      ),
                      trailing: Icon(
                        Icons.chevron_right_rounded,
                        color: colors.onSurfaceVariant,
                      ),
onTap: () => context.push(TechnicianRoutes.notifications),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        Icons.star_outline_rounded,
                        color: colors.onSurface,
                      ),
                      title: Text(
                        'Avis reçus',
                        style: TextStyle(color: colors.onSurface, fontSize: 14),
                      ),
                      subtitle: Text(
                        'Ce que les clients ont pensé de vos interventions',
                        style: TextStyle(
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                      trailing: Icon(
                        Icons.chevron_right_rounded,
                        color: colors.onSurfaceVariant,
                      ),
                      onTap: () => context.push(TechnicianRoutes.reviews),
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

/// Disponibilité, en toutes lettres.
///
/// « Injoignable » est distinct d'« hors ligne » et compte autant que lui : un
/// technicien qui se croit disponible alors que son téléphone ne parle plus au
/// serveur depuis un quart d'heure cherchera pourquoi aucune demande n'arrive,
/// et la vraie réponse est dans ces trois mots.
String _availabilityLabel(AvailabilityState state) {
  if (!state.isOnline) return 'Hors ligne';
  if (state.isUnreachable) return 'En ligne, injoignable';

  return 'En ligne';
}
