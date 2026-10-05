import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_avatar.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/notification_bell.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../../notifications/application/notification_providers.dart';
import '../../tickets/application/ticket_sync.dart';
import '../application/availability_controller.dart';
import '../application/technician_providers.dart';

/// Accueil technicien : sa disponibilité, ses compteurs, les demandes à traiter
/// et les prochaines interventions.
class TechnicianDashboardScreen extends ConsumerWidget {
  const TechnicianDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final user = ref.watch(currentUserProvider);
    final asyncTickets = ref.watch(technicianTicketsProvider(null));
    final stats = ref.watch(technicianStatsProvider);
    final unread = ref.watch(unreadCountProvider);

    // Le tableau de bord est monté en permanence — la pile d'onglets le garde
    // vivant même quand un autre onglet est affiché. C'est donc ici que la
    // synchronisation des listes se branche : la notification de statut y est
    // reçue, et la liste du client comme le détail ouvert suivent aussitôt.
    ref.watch(ticketSyncProvider);

    // La disponibilité est lue ici parce que l'accueil est toujours monté : c'est
    // le seul endroit qui survit à la navigation, et la boucle de répartition
    // doit tourner même quand le technicien regarde un autre écran de son espace.
    final availability = ref.watch(availabilityProvider);
    final availabilityController = ref.read(availabilityProvider.notifier);

    // Priorité : ce qui n'est pas encore pris en charge, puis le reste.
    final tickets = [...?asyncTickets.value]
      ..sort((a, b) {
        final urgentA = a.priority == Priority.urgent ? 0 : 1;
        final urgentB = b.priority == Priority.urgent ? 0 : 1;
        if (urgentA != urgentB) return urgentA - urgentB;
        // Les dates de création sont optionnelles côté API.
        final createdB = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final createdA = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return createdB.compareTo(createdA);
      });
    final upcoming = tickets
        .where(
          (ticket) =>
              ticket.status != TicketStatus.completed &&
              ticket.status != TicketStatus.closed &&
              ticket.status != TicketStatus.canceled,
        )
        .take(3)
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes interventions'),
        actions: [
          NotificationBell(
            count: unread,
            onPressed: () => context.push(TechnicianRoutes.notifications),
          ),
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.md),
            child: Center(
              // Le profil reste hors de la barre de navigation.
              child: Tooltip(
                message: 'Mon profil',
                child: InkWell(
                  onTap: () => context.push(TechnicianRoutes.profile),
                  customBorder: const CircleBorder(),
                  child: AppAvatar(
                    name: user?.displayName ?? 'Technicien',
                    size: 36,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(authControllerProvider.notifier).refreshProfile();
          ref.invalidate(technicianTicketsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.md,
            AppSpacing.xxl,
          ),
          children: [
            Text(
              'Bonjour ${user?.displayName ?? ''}',
              style: TextStyle(
                color: colors.onSurface,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Voici vos demandes assignées',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: AppSpacing.md),
            AvailabilityCard(
              state: availability,
              onToggle: (online) =>
                  availabilityController.setOnline(online),
            ),
            if (availability.hasOffers) ...[
              const SizedBox(height: AppSpacing.md),
              _OffersBanner(
                count: availability.offers.length,
                onTap: () => context.push(TechnicianRoutes.offers),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: StatTile(
                    label: 'À traiter',
                    value: '${stats.toDo}',
                    icon: Icons.assignment_late_outlined,
                    color: colors.warning,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: StatTile(
                    label: 'En cours',
                    value: '${stats.inProgress}',
                    icon: Icons.handyman_outlined,
                    color: colors.secondary,
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
            const SectionHeader(title: 'À traiter'),
            if (asyncTickets.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (asyncTickets.hasError)
              SizedBox(
                height: 220,
                child: ErrorView(
                  error: asyncTickets.error!,
                  onRetry: () =>
                      ref.invalidate(technicianTicketsProvider(null)),
                ),
              )
            else if (upcoming.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: Icons.inbox_rounded,
                  title: 'Aucune demande en attente',
                  message: 'Vos nouvelles interventions apparaîtront ici.',
                ),
              )
            else
              for (final ticket in upcoming)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _UpcomingTile(
                    ticket: ticket,
                    onTap: () => context.push(
                      '${TechnicianRoutes.tickets}/${ticket.id}',
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

/// Carte de disponibilité : le geste qui commande toute la répartition.
///
/// Elle est en tête d'écran et non dans le profil : sans elle, aucune demande
/// n'est proposée au technicien, et une option cachée dans un menu dont
/// personne ne sait qu'il existe ferait d'un circuit de répartition un
/// mécanisme muet.
///
/// L'état affiché est celui du serveur, jamais celui du bouton : « en ligne »
/// affiché avant que l'appel ne soit passé ferait croire que la répartition
/// tourne quand elle n'est peut-être jamais partie.
class AvailabilityCard extends StatelessWidget {
  const AvailabilityCard({super.key, required this.state, required this.onToggle});

  final AvailabilityState state;
  final void Function(bool online) onToggle;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final presence = state.presence;
    final online = state.isOnline;

    final (title, subtitle, color) = !online
        ? (
            'Vous êtes hors ligne',
            'Aucune demande ne vous sera proposée. Activez pour recevoir celles qui arrivent.',
            colors.onSurfaceVariant,
          )
        : state.isUnreachable
            ? (
                'En ligne, mais injoignable',
                'Votre application ne parle plus au serveur depuis un moment. Réouvrez-la pour recevoir les demandes.',
                colors.warning,
              )
            : (
                'Vous êtes en ligne',
                'Les demandes qui arrivent vous sont notifiées. Vous choisissez celle que vous prenez.',
                colors.success,
              );

    return AppCard(
      borderColor: online ? color.withValues(alpha: 0.4) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                online ? Icons.wifi_tethering_rounded : Icons.wifi_off_rounded,
                color: color,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              // Le chargement ne bouge pas le libellé : un bouton qui change de
              // texte fait croire que l'action a déjà eu lieu.
              if (state.loading)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Switch(value: online, onChanged: onToggle),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            subtitle,
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
          ),
          if (presence?.onlineSince != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'En ligne depuis ${Fmt.relativeDay(presence!.onlineSince)}',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}

/// Bandeau d'entrée vers les demandes proposées.
///
/// Affiché seulement quand il y en a : un bandeau « 0 demande » sur l'accueil
/// ferait du vide une information, alors qu'il ne dit rien tant que le circuit
/// tourne.
///
/// Le compte vient de la file, pas du compteur de notifications : une
/// notification lue ne doit pas laisser croire qu'une demande attend encore.
class _OffersBanner extends StatelessWidget {
  const _OffersBanner({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      onTap: onTap,
      borderColor: colors.primary,
      child: Row(
        children: [
          Icon(Icons.add_task_rounded, color: colors.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  count == 1
                      ? '1 demande vous est proposée'
                      : '$count demandes vous sont proposées',
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Acquirez la plus ancienne avant qu\'un autre ne le fasse.',
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: colors.primary),
        ],
      ),
    );
  }
}

/// Carte condensée d'une demande à traiter.
class _UpcomingTile extends StatelessWidget {
  const _UpcomingTile({required this.ticket, required this.onTap});

  final Ticket ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  ticket.reference,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              StatusBadge.ticket(ticket.status, dense: true),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusBadge.priority(ticket.priority),
              AppBadge(label: ticket.type, tone: AppBadgeTone.neutral),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${ticket.client?.name ?? 'Client'} · ${ticket.zoneName}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(
            Fmt.relativeDay(ticket.createdAt),
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
