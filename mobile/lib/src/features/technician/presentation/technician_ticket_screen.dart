import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/permissions/permissions_service.dart';
import '../../../core/widgets/trip_map_card.dart';
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
import '../../invoices/application/invoice_providers.dart';
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
  Future<void> _collect(Ticket ticket) async {
    final invoice = ticket.quoteInvoice!;

    // Un encaissement est un fait constaté, pas une intention : il est confirmé
    // avant d'être écrit, parce qu'un montant announced ne sera jamais repris.
    final confirmed = await confirmDialog(
      context,
      title: 'Déclarer un encaissement',
      message:
          'Vous confirmez avoir reçu ${Fmt.money(invoice.totalAmount)} en '
          'espèces pour cette intervention ?',
      confirmLabel: 'J\'ai encaissé',
      cancelLabel: 'Annuler',
    );

    if (!confirmed || !mounted) return;

    setState(() => _busy = true);
    try {
      // Le montant n'est pas transmis : le serveur reprend celui du devis. Un
      // montant saisi à la main ouvrirait la voie à un encaissement partiel
      // présenté comme un règlement complet.
      await ref
          .read(invoiceRepositoryProvider)
          .declareCashCollection(ticket.id);

      // La demande et le portefeuille changent d'un seul coup : sans les deux
      // relectures, le technicien reverrait son encaissement seulement après
      // avoir quitté l'écran.
      ref.invalidate(technicianTicketDetailProvider(ticket.id));
      ref.invalidate(technicianWalletProvider);

      if (mounted) {
        showAppSnackBar(
          context,
          'Encaissement enregistré dans votre portefeuille.',
        );
      }
    } on ApiException catch (error) {
      // Le motif du serveur est remonté tel quel : le technicien sait s'il doit
      // corriger ou réessayer, ce qu'un échec générique ne lui dirait pas.
      if (mounted) showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Encaissement impossible. Réessayez.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

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
  /// `PENDING_QUOTE` en est exclu : un devis y attend une décision du client, et
  /// lui en proposer un autre pendant qu'il tranche le laisserait sans savoir
  /// lequel payer. Un devis **refusé** en revanche autorise une correction :
  /// le client a écarté un montant, pas l'intervention. Le serveur n'accepte
  /// cette réécriture que si le devis précédent n'est ni accepté ni payé.
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
          final tracking = ref.watch(technicianTrackingProvider);

          // Un devis est livalent sur la demande : dès qu'il existe, le client
          // en a connaissance et tranche. Voir pourquoi plus bas.
          final hasQuote = ticket.quoteInvoice != null;

          // La réparation se décide sur un devis que le client a autorisé, pas
          // sur un devis rédigé : c'est lui qui autorise qu'on touche à son
          // installation. Sans autorisation, le technicien peut encore
          // corriger son devis ou annuler — pas réparer.
          //
          // Un devis payé autorise autant qu'un devis accepté : même accord,
          // déjà honoré en argent. Ne retenir que `accepted` cachait le bouton
          // dès que le client règlait, et le serveur refusait la transition —
          // le technicien n'avait plus alors aucun recours. Le refus, lui,
          // n'autorise rien : le client a écarté le montant.
          final quoteAuthorizes =
              ticket.quoteInvoice?.status == DocumentStatus.accepted ||
              ticket.quoteInvoice?.status == DocumentStatus.paid;

          // Le refus ne laisse pas la demande coincée : il la rend au
          // technicien, qui peut corriger son devis ou signaler une impossibilité.
          final quoteRefused =
              ticket.quoteInvoice?.status == DocumentStatus.rejected;

          // Un devis payé ne se ré-enregistre pas : le bouton disparaît, et le
          // risque n'est pas qu'il soit présent, mais qu'un double appel crée
          // deux règlements pour un devis unique.
          final hasQuotePaid =
              ticket.quoteInvoice?.status == DocumentStatus.paid ||
              ticket.quoteInvoice?.payment != null;

          // Le devis ne retire pas au technicien la main sur sa demande : il
          // retire seulement la réparation tant que le client n'a pas accepté.
          // La contrainte ne porte que sur le passage depuis un devis en
          // attente — sans devis, réparer directement reste possible, et c'est
          // le cas courant d'une panne qui ne demande aucune pièce.
          final awaitingQuoteDecision = ticket.status == TicketStatus.pendingQuote;

          final next = TicketStatus.transitionsFrom(ticket.status)
              .where(
                (status) =>
                    status != TicketStatus.repairing ||
                    !awaitingQuoteDecision ||
                    quoteAuthorizes,
              )
              .toList();

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

              // La même carte que chez le client, vue du technicien : il voit
              // exactement ce que voit le client, donc il ne se trompe pas sur
              // l'état du trajet en se fiant à son propre écran.
              if (ticket.status == TicketStatus.enRoute &&
                  (ticket.tracking?.hasRoute ?? false)) ...[
                TripMapCard(
                  tracking: ticket.tracking!,
                  technicianName: 'Vous',
                ),
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

              // La réparation disparaît des actions disponibles tant que le devis
              // n'est pas accepté. Le dire explicitement évite que le bouton
              // manquant passe pour un défaut : l'attente est normale, elle a
              // un auteur et une issue.
              if (awaitingQuoteDecision && !quoteAuthorizes)
                AppCard(
                  child: Row(
                    children: [
                      Icon(
                        quoteRefused
                            ? Icons.edit_note_rounded
                            : Icons.hourglass_top_rounded,
                        color: quoteRefused
                            ? colors.warning
                            : colors.onSurfaceVariant,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          quoteRefused
                              ? 'Le client a refusé le devis. Corrigez-le, ou '
                                  'signalez une impossibilité si rien ne peut '
                                  'être fait.'
                              : 'Le devis attend la décision du client. Vous '
                                  'pourrez lancer la réparation dès qu\'il '
                                  'l\'aura accepté.',
                          style: TextStyle(
                            color: colors.onSurface,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

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

              // Le devis existe, le client en a connaissance et doit décider :
              // une annulation depuis ici reviendrait à retirer un devis sous le
              // nez de quelqu'un qui le lit, et à le laisser attendre une
              // intervention qui n'a plus de raison d'être. Un devis refusé, en
              // revanche, ne lies plus personne : le client l'a écarté et la
              // demande lui revient.
              // Un devis accepté n'est pas un devis encaissé. Le règlement par
              // mobile money se déclare côté client, mais un encaissement en
              // espèces n'a pas d'auteur déclaré : c'est le technicien qui tient
              // les billets, et le client peut même être absent. Sans ce bouton,
              // ce paiement n'entrait dans aucun registre — ni relevé du
              // technicien, ni facturation de la régie.
              if (quoteAuthorizes &&
                  !hasQuotePaid &&
                  ticket.quoteInvoice!.payment == null)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: AppButton(
                    label: 'Encaisser ${Fmt.money(ticket.quoteInvoice!.totalAmount)}',
                    icon: Icons.payments_rounded,
                    loading: _busy,
                    onPressed: _busy ? null : () => _collect(ticket),
                  ),
                ),

              if ((!hasQuote || quoteRefused) &&
                  ticket.status.isOpen &&
                  next.contains(TicketStatus.canceled))
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
          // Un refus définitif ne se rattrape pas en réessayant : Android
          // n'affichera plus de dialogue. Sans ce bouton, le technicien n'a
          // aucun moyen de rétablir le suivi sans quitter l'application.
          if (!state.active && state.message != null) ...[
            const Divider(),
            Text(
              state.message!,
              style: TextStyle(
                color: context.colors.error,
                fontSize: 13,
                height: 1.4,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: 'Ouvrir les réglages',
              icon: Icons.settings_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () => PermissionsService.openSettings(),
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
