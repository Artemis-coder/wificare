import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_input.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/ticket_progress.dart';
import '../../../core/network/api_exception.dart';
import '../../invoices/application/invoice_providers.dart';
import '../application/ticket_queries.dart';
import '../application/ticket_providers.dart';
import 'arrival_estimate_card.dart';

/// Détail d'une demande : suivi d'avancement, rapport d'intervention, facture et avis.
class TicketDetailScreen extends ConsumerWidget {
  const TicketDetailScreen({super.key, required this.ticketId});

  final String ticketId;

  static const Map<String, String> _checklistLabels = {
    'router_restarted': 'Routeur redémarré',
    'cable_checked': 'Câble vérifié',
    'signal_tested': 'Signal testé',
    'equipment_replaced': 'Équipement remplacé',
    'config_updated': 'Configuration mise à jour',
    'client_informed': 'Client informé',
  };

  String _absoluteUrl(String url) =>
      url.startsWith('http') ? url : '${AppConfig.apiBaseUrl}$url';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncTicket = ref.watch(ticketDetailProvider(ticketId));

    return Scaffold(
      appBar: AppBar(title: const Text('Demande')),
      body: asyncTicket.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(ticketDetailProvider(ticketId)),
        ),
        data: (ticket) => ListView(
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
                            color: context.colors.onSurface,
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
                      AppBadge(label: ticket.type, tone: AppBadgeTone.neutral),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  InfoRow(
                    label: 'Zone Wi-Fi',
                    value: ticket.zoneLocation.isEmpty
                        ? ticket.zoneName
                        : '${ticket.zoneName} · ${ticket.zoneLocation}',
                    icon: Icons.wifi_tethering_rounded,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionHeader(title: "Suivi de l'intervention"),
                  // Le devis n'est pas systématique : l'étape ne s'affiche que
                  // si la demande en porte un, sinon le client la verrait
                  // promise sans jamais la voir arriver.
                  TicketProgressTracker(
                    status: ticket.status,
                    hasQuote: ticket.quoteInvoice != null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            // L'arrivée n'a de sens que le temps du trajet : hors de cette
            // fenêtre, une ETA affichée serait une promesse que plus personne ne
            // tient. L'écran reste discret : une carte, pas un bandeau.
            if (ticket.status == TicketStatus.enRoute)
              ArrivalEstimateCard(
                ticketId: ticket.id,
                zoneId: ticket.wifiZoneId,
                tracking: ticket.tracking,
                hasDestination: ticket.wifiZone?.hasLocation ?? false,
              ),
            const SizedBox(height: AppSpacing.md),

            AppCard(
              child: Column(
                children: [
                  const SectionHeader(title: 'Informations'),
                  InfoRow(
                    label: 'Date de création',
                    value: Fmt.dateTime(ticket.createdAt),
                    icon: Icons.event_rounded,
                  ),
                  InfoRow(
                    label: 'Technicien',
                    value: ticket.technician?.displayName ?? 'Non affecté',
                    icon: Icons.engineering_rounded,
                  ),
                  if ((ticket.technician?.phone ?? '').isNotEmpty)
                    InfoRow(
                      label: 'Téléphone',
                      value: ticket.technician!.phone,
                      icon: Icons.phone_rounded,
                      onTap: () => _launch(
                        context,
                        Uri(scheme: 'tel', path: ticket.technician!.phone),
                        'Impossible d\'appeler ce numéro.',
                      ),
                    ),
                  if ((ticket.client?.address ?? '').isNotEmpty)
                    InfoRow(
                      label: 'Adresse',
                      value: ticket.client!.address!,
                      icon: Icons.location_on_rounded,
                      onTap: () => _launch(
                        context,
                        Uri.parse(
                          'geo:0,0?q=${Uri.encodeComponent(ticket.client!.address!)}',
                        ),
                        'Aucune application de cartographie disponible.',
                      ),
                    ),
                  InfoRow(
                    label: 'Rendez-vous',
                    value: Fmt.dateTime(ticket.scheduledFor),
                    icon: Icons.schedule_rounded,
                  ),
                ],
              ),
            ),

            if (ticket.description != null) ...[
              const SizedBox(height: AppSpacing.md),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionHeader(title: 'Description'),
                    Text(
                      ticket.description!,
                      style: TextStyle(color: context.colors.onSurface, fontSize: 14),
                    ),
                  ],
                ),
              ),
            ],

            if (ticket.intervention != null) ...[
              const SizedBox(height: AppSpacing.md),
              _InterventionCard(intervention: ticket.intervention!),
            ],

            if (ticket.files.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              _FilesCard(files: ticket.files, absoluteUrl: _absoluteUrl),
            ],

            // Le devis apparaît avant le rapport d'intervention : c'est le
            // document que le client attend à ce stade, et il est le seul qui
            // lui demande quelque chose.
            if (ticket.quoteInvoice != null) ...[
              const SizedBox(height: AppSpacing.md),
              _QuoteCard(invoice: ticket.quoteInvoice!),
            ],

            const SizedBox(height: AppSpacing.md),
            if (ticket.evaluation != null)
              _EvaluationCard(evaluation: ticket.evaluation!)
            else if (ticket.status == TicketStatus.completed ||
                ticket.status == TicketStatus.pendingPayment ||
                ticket.status == TicketStatus.closed)
              _RatingCard(
                ticketId: ticket.id,
                onSubmitted: () => ref.invalidate(ticketDetailProvider(ticket.id)),
              ),
          ],
        ),
      ),
    );
  }

  static Future<void> _launch(BuildContext context, Uri uri, String error) async {
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened && context.mounted) {
      showAppSnackBar(context, error, isError: true);
    }
  }
}

class _InterventionCard extends StatelessWidget {
  const _InterventionCard({required this.intervention});

  final Intervention intervention;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final labels = TicketDetailScreen._checklistLabels;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(title: "Rapport d'intervention"),
          if (intervention.diagnostic != null) ...[
            Text(
              'Diagnostic',
              style: TextStyle(
                color: colors.secondary,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              intervention.diagnostic!,
              style: TextStyle(color: colors.onSurface, fontSize: 14),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (intervention.solution != null) ...[
            Text(
              'Solution apportée',
              style: TextStyle(
                color: colors.secondary,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              intervention.solution!,
              style: TextStyle(color: colors.onSurface, fontSize: 14),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (intervention.checklist.isNotEmpty) ...[
            Text(
              'Points de contrôle',
              style: TextStyle(
                color: colors.secondary,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            for (final entry in intervention.checklist.entries)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Icon(
                      entry.value ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                      size: 18,
                      color: entry.value ? colors.success : colors.onSurfaceVariant,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        labels[entry.key] ??
                            (entry.key
                                    .replaceAll('_', ' ')
                                    .split(' ')
                                    .map((w) => w.isEmpty
                                        ? w
                                        : '${w[0].toUpperCase()}${w.substring(1)}')
                                    .join(' ')),
                        style: TextStyle(color: colors.onSurface, fontSize: 14),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: AppSpacing.sm),
          ],
          if (intervention.durationMin != null)
            InfoRow(
              label: 'Durée d\'intervention',
              value: Fmt.minutes(intervention.durationMin),
              icon: Icons.timer_outlined,
            ),
        ],
      ),
    );
  }
}

class _FilesCard extends StatelessWidget {
  const _FilesCard({required this.files, required this.absoluteUrl});

  final List<FileAttachment> files;
  final String Function(String) absoluteUrl;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final images = files.where((f) => f.fileType == FileType.image).toList();
    final others = files.where((f) => f.fileType != FileType.image).toList();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(title: 'Pièces jointes (${files.length})'),
          if (images.isNotEmpty)
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final file in images)
                  GestureDetector(
                    onTap: () => TicketDetailScreen._launch(
                      context,
                      Uri.parse(absoluteUrl(file.url)),
                      'Impossible d\'ouvrir ce fichier.',
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      child: CachedNetworkImage(
                        imageUrl: absoluteUrl(file.url),
                        width: 84,
                        height: 84,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => Container(
                          width: 84,
                          height: 84,
                          color: colors.surfaceVariant,
                        ),
                        errorWidget: (_, _, _) => Container(
                          width: 84,
                          height: 84,
                          color: colors.surfaceVariant,
                          child: Icon(Icons.broken_image_rounded, color: colors.onSurfaceVariant),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          for (final file in others)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              leading: Icon(Icons.insert_drive_file_rounded, color: colors.primary),
              title: Text(
                file.url.split('/').last,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: colors.onSurface, fontSize: 14),
              ),
              subtitle: Text(
                file.fileType.label,
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
              trailing: const Icon(Icons.open_in_new_rounded, size: 18),
              onTap: () => TicketDetailScreen._launch(
                context,
                Uri.parse(absoluteUrl(file.url)),
                'Impossible d\'ouvrir ce fichier.',
              ),
            ),
        ],
      ),
    );
  }
}

/// Devis du technicien, tel que le client le voit sur sa propre demande.
///
/// L'écran n'affichait qu'un type, une pastille et un montant : ni les lignes,
/// ni les notes, et surtout aucun moyen de trancher. Le client devait retrouver
/// la facture dans l'onglet pour accepter ou refuser un devis qui concernait
/// pourtant la panne qu'il était en train de lire.
///
/// Le parcours de décision reste celui de l'onglet « Factures » — même
/// repository, même confirmation avant un refus, mêmes invalidations. Dupliquer
/// la règle aurait produit deux écrans capables de diverger sur ce qui décide
/// si le technicien peut réparer.
class _QuoteCard extends ConsumerWidget {
  const _QuoteCard({required this.invoice});

  final QuoteInvoice invoice;

  Future<void> _decide(BuildContext context, WidgetRef ref, bool accept) async {
    if (!accept) {
      final confirmed = await confirmDialog(
        context,
        title: 'Refuser le devis',
        message:
            'Le technicien sera prévenu et pourra corriger son devis. '
            'Votre demande reste ouverte.',
        confirmLabel: 'Refuser',
        cancelLabel: 'Annuler',
        destructive: true,
      );

      if (!confirmed || !context.mounted) return;
    }

    try {
      await ref.read(invoiceRepositoryProvider).decide(invoice.id, accept: accept);

      // La décision change le devis et la demande : c'est elle qui décide si le
      // technicien peut réparer, et le fil d'étapes en dépend. La liste du
      // client est relue aussi, pour que ses compteurs suivent.
      ref.invalidate(ticketDetailProvider(invoice.ticketId ?? ''));

      // La liste porte le statut de la demande et alimente les compteurs du
      // tableau de bord. Sans cette invalidation, le client verrait « Devis en
      // attente » dans son fil d'étapes et « En cours » dans sa liste.
      ref.invalidate(ticketListProvider);

      if (context.mounted) {
        showAppSnackBar(
          context,
          accept
              ? 'Devis accepté. Le technicien peut lancer la réparation.'
              : 'Devis refusé. Le technicien peut le corriger.',
        );
      }
    } on ApiException catch (error) {
      if (context.mounted) showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (context.mounted) {
        showAppSnackBar(context, 'Décision impossible. Réessayez.', isError: true);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final awaiting = invoice.status == DocumentStatus.sent;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: SectionHeader(title: 'Devis du technicien'),
              ),
              StatusBadge.document(invoice.status),
            ],
          ),

          if (invoice.lines.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final line in invoice.lines) _QuoteLineRow(line: line),
            Divider(color: colors.outlineVariant),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Montant total',
                    style: TextStyle(
                      color: colors.onSurfaceVariant,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Text(
                  Fmt.money(invoice.totalAmount),
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],

          if (invoice.notes != null && invoice.notes!.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              invoice.notes!,
              style: TextStyle(
                color: colors.onSurfaceVariant,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],

          if (invoice.payment != null) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Icon(Icons.payments_rounded, size: 18, color: colors.success),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    'Réglé : ${invoice.payment!.channel.label}'
                    '${invoice.payment!.operator == null ? '' : ' ${invoice.payment!.operator!.label}'}'
                    ' · ${Fmt.money(invoice.payment!.amount)}',
                    style: TextStyle(
                      color: colors.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ],

          // Accepter et refuser n'est proposé qu'à un devis envoyé : un devis
          // déjà tranché ne se re-discute pas, et un devis payé est un contrat
          // exécuté. Régler reste dans l'onglet « Factures » — c'est un autre
          // acte, et le confondre avec accepter reviendrait à faire payer pour
          // autoriser une intervention.
          if (awaiting) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: 'Accepter le devis',
              icon: Icons.check_circle_outline_rounded,
              onPressed: () => _decide(context, ref, true),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: 'Refuser le devis',
              variant: AppButtonVariant.secondary,
              size: AppButtonSize.sm,
              onPressed: () => _decide(context, ref, false),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Refuser garde votre argent : le technicien sera prévenu et pourra '
              'proposer un autre devis. Régler se fait dans l\'onglet « Factures ».',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12, height: 1.4),
            ),
          ],
        ],
      ),
    );
  }
}

/// Une ligne du devis : désignation, quantité et prix, comme sur une facture.
class _QuoteLineRow extends StatelessWidget {
  const _QuoteLineRow({required this.line});

  final InvoiceLine line;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.description,
                  style: TextStyle(color: colors.onSurface, fontSize: 14),
                ),
                Text(
                  '${line.quantity} × ${Fmt.money(line.unitPrice)}',
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            Fmt.money(line.totalPrice),
            style: TextStyle(
              color: colors.onSurface,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _EvaluationCard extends StatelessWidget {
  const _EvaluationCard({required this.evaluation});

  final Evaluation evaluation;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(title: 'Votre avis'),
          StarRating(rating: evaluation.rating),
          if (evaluation.comment != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              evaluation.comment!,
              style: TextStyle(color: colors.onSurface, fontSize: 14),
            ),
          ],
          const SizedBox(height: AppSpacing.xs),
          Text(
            Fmt.dayMonth(evaluation.createdAt),
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _RatingCard extends ConsumerStatefulWidget {
  const _RatingCard({required this.ticketId, required this.onSubmitted});

  final String ticketId;
  final VoidCallback onSubmitted;

  @override
  ConsumerState<_RatingCard> createState() => _RatingCardState();
}

class _RatingCardState extends ConsumerState<_RatingCard> {
  final _commentController = TextEditingController();
  int _rating = 0;
  bool _busy = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_rating == 0) {
      showAppSnackBar(context, 'Choisissez une note.', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      await ref.read(ticketRepositoryProvider).evaluate(
        ticketId: widget.ticketId,
        rating: _rating,
        comment: _commentController.text.trim(),
      );
      if (!mounted) return;
      showAppSnackBar(context, 'Merci pour votre avis !');
      widget.onSubmitted();
    } catch (error) {
      if (mounted) {
        showAppSnackBar(
          context,
          error is ApiException ? error.message : 'Envoi impossible.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(title: 'Évaluez cette intervention'),
          StarRating(
            rating: _rating,
            onChanged: (value) => setState(() => _rating = value),
          ),
          const SizedBox(height: AppSpacing.md),
          AppInput(
            controller: _commentController,
            label: 'Commentaire (optionnel)',
            variant: AppInputVariant.multiline,
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(label: 'Envoyer mon avis', loading: _busy, onPressed: _submit),
        ],
      ),
    );
  }
}
