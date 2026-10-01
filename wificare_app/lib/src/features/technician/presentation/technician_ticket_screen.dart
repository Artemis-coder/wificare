import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../application/technician_providers.dart';
import '../application/tracking_controller.dart';
import '../data/technician_repository.dart';
import 'quote_composer.dart';

final technicianTicketDetailProvider = FutureProvider.autoDispose
    .family<Ticket, String>(
      (ref, id) => ref.read(technicianRepositoryProvider).byId(id),
    );

/// Détail d'une intervention côté technicien.
///
/// Contrairement au détail client, l'écran est orienté action : le technicien
/// fait avancer la demande, c'est le cœur de son travail.
class TechnicianTicketScreen extends ConsumerStatefulWidget {
  const TechnicianTicketScreen({super.key, required this.ticketId});

  final String ticketId;

  @override
  ConsumerState<TechnicianTicketScreen> createState() =>
      _TechnicianTicketScreenState();
}

class _TechnicianTicketScreenState
    extends ConsumerState<TechnicianTicketScreen> {
  bool _busy = false;

  String _absoluteUrl(String url) =>
      url.startsWith('http') ? url : '${AppConfig.apiBaseUrl}$url';

  /// Fait avancer la demande, et suit le déplacement qui va avec.
  ///
  /// Le partage de position est lié à `EN_ROUTE` : il démarre quand la demande
  /// passe en route et s'arrête dès que le technicien ne circule plus (passage
  /// au diagnostic, annulation). Il est déclenché **après** la mise à jour du
  /// statut, jamais avant : l'API refuse un suivi sur une demande qui n'est pas
  /// en route, et un suivi qui échoue ne doit pas faire perdre la transition.
  Future<void> _advance(Ticket ticket, TicketStatus next) async {
    final wasEnRoute = ticket.status == TicketStatus.enRoute;

    setState(() => _busy = true);
    try {
      await ref
          .read(technicianRepositoryProvider)
          .updateStatus(ticket.id, next);
      ref.invalidate(technicianTicketDetailProvider(ticket.id));
      ref.invalidate(technicianTicketsProvider);

      final tracking = ref.read(technicianTrackingProvider.notifier);
      if (next == TicketStatus.enRoute) {
        await tracking.start(ticket.id);
      } else if (wasEnRoute) {
        await tracking.stop(ticket.id);
      }

      if (mounted) {
        // Un suivi indisponible se signale, mais la transition est acquise :
        // l'ETA est un confort, pas une condition pour travailler.
        final state = ref.read(technicianTrackingProvider);
        final note = state.message;

        showAppSnackBar(
          context,
          note == null
              ? 'Demande marquée « ${next.label} ».'
              : 'Demande marquée « ${next.label} ». $note',
          isError: note != null,
        );
      }
    } on ApiException catch (error) {
      if (mounted) showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Mise à jour impossible. Réessayez.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Rédaction puis envoi du devis au client.
  ///
  /// La fenêtre ne renvoie que des lignes valides : elle est le seul endroit
  /// où le technicien saisit, et le serveur revérifie de son côté.
  Future<void> _sendQuote(Ticket ticket) async {
    final draft = await showQuoteComposer(
      context,
      ticketReference: ticket.reference,
    );

    if (draft == null || draft.lines.isEmpty || !mounted) return;

    setState(() => _busy = true);
    try {
      await ref.read(technicianRepositoryProvider).sendQuote(
        ticketId: ticket.id,
        lines: [
          for (final line in draft.lines)
            QuoteLineDraft(
              description: line.description.text.trim(),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            ),
        ],
        notes: draft.notes,
      );

      ref.invalidate(technicianTicketDetailProvider(ticket.id));
      ref.invalidate(technicianTicketsProvider);

      if (mounted) {
        showAppSnackBar(
          context,
          'Devis envoyé au client.',
        );
      }
    } on ApiException catch (error) {
      if (mounted) showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Envoi du devis impossible. Réessayez.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Le devis se rédige une fois le diagnostic posé, ou pendant la réparation
  /// lorsque des travaux supplémentaires s'avèrent nécessaires.
  ///
  /// `PENDING_QUOTE` en est exclu : un devis attend alors une décision du
  /// client, et lui en proposer un autre pendant qu'il tranche le laisserait
  /// sans savoir lequel payer. Le serveur refuse de toute façon un second
  /// devis sur une demande qui en porte déjà un.
  static bool _canQuote(TicketStatus status) =>
      status == TicketStatus.diagnosing || status == TicketStatus.repairing;

  Future<void> _cancel(Ticket ticket) async {
    final confirmed = await confirmDialog(
      context,
      title: 'Annuler la demande',
      message:
          'La demande ${ticket.reference} sera annulée. Cette action est définitive.',
      confirmLabel: 'Oui',
      cancelLabel: 'Non',
      destructive: true,
    );
    if (confirmed) await _advance(ticket, TicketStatus.canceled);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final asyncTicket = ref.watch(
      technicianTicketDetailProvider(widget.ticketId),
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Intervention')),
      body: asyncTicket.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () =>
              ref.invalidate(technicianTicketDetailProvider(widget.ticketId)),
        ),
        data: (ticket) {
          final next = TicketStatus.transitionsFrom(ticket.status);
          final tracking = ref.watch(technicianTrackingProvider);

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.xxl,
            ),
            children: [
              AppCard(
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
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        StatusBadge.ticket(ticket.status),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      children: [
                        StatusBadge.priority(ticket.priority),
                        AppBadge(
                          label: ticket.type,
                          tone: AppBadgeTone.neutral,
                        ),
                      ],
                    ),
                    if (ticket.description != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        ticket.description!,
                        style: TextStyle(
                          color: colors.onSurface,
                          fontSize: 14,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              // Où aller : le technicien se déplace, l'adresse prime.
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionHeader(title: 'Intervention'),
                    InfoRow(
                      label: 'Client',
                      value: ticket.client?.name ?? 'Client inconnu',
                      icon: Icons.person_outline_rounded,
                    ),
                    if ((ticket.client?.contact ?? '').isNotEmpty) ...[
                      const Divider(),
                      InfoRow(
                        label: 'Téléphone',
                        value: ticket.client?.contact ?? '',
                        icon: Icons.phone_outlined,
                      ),
                    ],
                    const Divider(),
                    InfoRow(
                      label: 'Zone',
                      value: ticket.zoneName,
                      icon: Icons.router_outlined,
                    ),
                    if (ticket.zoneLocation.isNotEmpty) ...[
                      const Divider(),
                      InfoRow(
                        label: 'Emplacement',
                        value: ticket.zoneLocation,
                        icon: Icons.location_on_outlined,
                      ),
                    ],
                    const Divider(),
                    InfoRow(
                      label: 'Signalée',
                      value: Fmt.relativeDay(ticket.createdAt),
                      icon: Icons.schedule_rounded,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              // Le suivi n'existe que pendant le déplacement : l'afficher à
              // chaque étape donnerait au technicien l'impression qu'il est
              // encore partagé après le diagnostic.
              if (ticket.status == TicketStatus.enRoute) ...[
                _TrackingCard(state: tracking),
                const SizedBox(height: AppSpacing.md),
              ],

              if (ticket.files.isNotEmpty) ...[
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SectionHeader(title: 'Photos du client'),
                      const SizedBox(height: AppSpacing.sm),
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.sm,
                        children: [
                          for (final file in ticket.files)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(AppRadius.md),
                              child: CachedNetworkImage(
                                imageUrl: _absoluteUrl(file.url),
                                width: 88,
                                height: 88,
                                fit: BoxFit.cover,
                                errorWidget: (_, _, _) => Container(
                                  width: 88,
                                  height: 88,
                                  color: colors.surfaceVariant,
                                  child: Icon(
                                    Icons.broken_image_outlined,
                                    color: colors.onSurfaceVariant,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
              ],

              if (ticket.intervention != null) ...[
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SectionHeader(title: 'Mon compte rendu'),
                      if (ticket.intervention!.diagnostic != null) ...[
                        InfoRow(
                          label: 'Diagnostic',
                          value: ticket.intervention!.diagnostic!,
                        ),
                        const Divider(),
                      ],
                      if (ticket.intervention!.solution != null) ...[
                        InfoRow(
                          label: 'Solution',
                          value: ticket.intervention!.solution!,
                        ),
                        const Divider(),
                      ],
                      if (ticket.intervention!.durationMin != null)
                        InfoRow(
                          label: 'Durée',
                          value: '${ticket.intervention!.durationMin} min',
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
              ],

              // Action principale : faire avancer la demande.
              if (next.isNotEmpty) ...[
                const SectionHeader(title: 'Faire avancer'),
                AppCard(
                  child: Column(
                    children: [
                      for (final status in next)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                          child: SizedBox(
                            width: double.maxFinite,
                            child: AppButton(
                              label: _actionLabel(status),
                              icon: _actionIcon(status),
                              variant: status == TicketStatus.canceled
                                  ? AppButtonVariant.destructive
                                  : AppButtonVariant.primary,
                              loading: _busy,
                              onPressed: _busy
                                  ? null
                                  : () => _advance(ticket, status),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ] else
                AppCard(
                  child: Row(
                    children: [
                      Icon(
                        Icons.check_circle_outline_rounded,
                        color: colors.success,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          'Cette demande est terminée, aucune action à mener.',
                          style: TextStyle(
                            color: colors.onSurface,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

              // Le devis se rédige une fois le diagnostic posé : c'est à ce
              // moment que le technicien sait ce qu'il a à facturer.
              if (_canQuote(ticket.status))
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: AppButton(
                    label: 'Envoyer un devis au client',
                    icon: Icons.request_quote_outlined,
                    variant: AppButtonVariant.secondary,
                    loading: _busy,
                    onPressed: _busy ? null : () => _sendQuote(ticket),
                  ),
                ),

              if (ticket.status.isOpen && next.contains(TicketStatus.canceled))
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: AppButton(
                    label: 'Signaler une impossibilité',
                    icon: Icons.report_gmailerrorred_outlined,
                    variant: AppButtonVariant.destructive,
                    onPressed: _busy ? null : () => _cancel(ticket),
                  ),
                ),
              const SizedBox(height: AppSpacing.lg),
            ],
          );
        },
      ),
    );
  }

  static String _actionLabel(TicketStatus status) => switch (status) {
    TicketStatus.assigned => 'Prendre en charge',
    TicketStatus.confirmed => 'Confirmer le rendez-vous',
    TicketStatus.enRoute => 'Démarrer le déplacement',
    TicketStatus.diagnosing => 'Commencer le diagnostic',
    TicketStatus.pendingQuote => 'Envoyer un devis',
    TicketStatus.repairing => 'Passer en réparation',
    TicketStatus.completed => 'Marquer comme terminée',
    TicketStatus.pendingPayment => 'Attendre le paiement',
    TicketStatus.closed => 'Clôturer la demande',
    TicketStatus.toVerify => 'Mettre à vérifier',
    TicketStatus.canceled => 'Annuler la demande',
    TicketStatus.created => 'Remettre à nouveau',
  };

  static IconData _actionIcon(TicketStatus status) => switch (status) {
    TicketStatus.assigned => Icons.assignment_ind_outlined,
    TicketStatus.confirmed => Icons.event_available_outlined,
    TicketStatus.enRoute => Icons.directions_car_outlined,
    TicketStatus.diagnosing => Icons.search_rounded,
    TicketStatus.pendingQuote => Icons.request_quote_outlined,
    TicketStatus.repairing => Icons.build_outlined,
    TicketStatus.completed => Icons.check_circle_outline_rounded,
    TicketStatus.pendingPayment => Icons.payments_outlined,
    TicketStatus.closed => Icons.lock_outline_rounded,
    TicketStatus.toVerify => Icons.rule_rounded,
    TicketStatus.canceled => Icons.cancel_outlined,
    TicketStatus.created => Icons.undo_rounded,
  };
}

/// État du partage de position pendant le déplacement.
///
/// Le technicien doit pouvoir vérifier d'un coup d'œil que le client voit
/// vraiment son arrivée : un service actif mais muet se traduirait par un ETA
/// figé chez le client sans que personne ne s'en aperçoive.
class _TrackingCard extends StatelessWidget {
  const _TrackingCard({required this.state});

  final TechnicianTrackingState state;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(title: 'Suivi de position'),
          InfoRow(
            label: 'État',
            value: _status,
            icon: state.active
                ? Icons.my_location_rounded
                : Icons.location_off_outlined,
            valueColor: state.active ? context.colors.success : context.colors.error,
          ),
          if (state.hasSentPosition) ...[
            const Divider(),
            InfoRow(
              label: 'Position envoyée',
              value: Fmt.dateTime(state.lastSentAt),
            ),
          ],
          if (state.distanceMeters != null || state.etaMinutes != null) ...[
            const Divider(),
            InfoRow(
              label: 'Restant pour le client',
              value: _remaining,
            ),
          ],
        ],
      ),
    );
  }

  String get _status {
    if (!state.available) {
      return 'Indisponible sur cet appareil';
    }
    if (!state.active) {
      return state.message ?? 'Arrêté';
    }
    return state.hasSentPosition
        ? 'Actif — position envoyée'
        : 'Actif — en attente du signal GPS';
  }

  String get _remaining {
    final parts = <String>[];

    final distance = state.distanceMeters;
    if (distance != null) {
      parts.add(
        distance < 1000
            ? '${distance.round()} m'
            : '${(distance / 1000).toStringAsFixed(1)} km',
      );
    }

    final eta = state.etaMinutes;
    if (eta != null) parts.add('environ $eta min');

    return parts.isEmpty ? '—' : parts.join(' · ');
  }
}
