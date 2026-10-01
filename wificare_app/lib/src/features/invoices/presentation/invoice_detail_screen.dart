import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/widgets/app_button.dart';
import '../application/invoice_providers.dart';
import 'payment_sheet.dart';

final invoiceDetailProvider = FutureProvider.family<QuoteInvoice, String>((
  ref,
  id,
) {
  return ref.read(invoiceRepositoryProvider).byId(id);
});

/// Détail d'un devis ou d'une facture.
///
/// Le devis est le document que le client valide et règle : c'est donc ici que
/// se trouve le bouton de règlement, et non dans la liste des factures.
class InvoiceDetailScreen extends ConsumerWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invoiceDetailProvider(invoiceId));

    return Scaffold(
      appBar: AppBar(
        title: Text(async.value?.type.label ?? 'Document'),
      ),
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorView(
            error: error,
            onRetry: () => ref.invalidate(invoiceDetailProvider(invoiceId)),
          ),
          data: (invoice) => _Content(invoice: invoice),
        ),
      ),
    );
  }
}

class _Content extends ConsumerWidget {
  const _Content({required this.invoice});

  final QuoteInvoice invoice;

  /// Enregistre le règlement choisi par le client.
  Future<void> _pay(BuildContext context, WidgetRef ref) async {
    final ticketId = invoice.ticketId;

    if (ticketId == null) return;

    final choice = await showPaymentSheet(
      context,
      amount: invoice.totalAmount,
      ticketReference: invoice.ticketReference,
    );

    if (choice == null || !context.mounted) return;

    try {
      await ref
          .read(invoiceRepositoryProvider)
          .pay(
            ticketId: ticketId,
            channel: choice.channel,
            operator: choice.operator,
            transactionRef: choice.transactionRef,
          );

      ref.invalidate(invoiceDetailProvider(invoice.id));

      if (context.mounted) {
        showAppSnackBar(
          context,
          choice.isCash
              ? 'Paiement enregistré. Remettez la somme au technicien.'
              : 'Paiement déclaré. Le technicien en est informé.',
        );
      }
    } on ApiException catch (error) {
      if (context.mounted) showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Paiement impossible. Réessayez.',
          isError: true,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final payment = invoice.payment;
    final isPaid = invoice.status == DocumentStatus.paid;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.md),
      children: [
        AppCard(
          child: Column(
            children: [
              InfoRow(label: 'Statut', value: invoice.status.label),
              const Divider(),
              InfoRow(label: 'Type', value: invoice.type.label),
              const Divider(),
              InfoRow(label: 'Ticket de référence', value: invoice.ticketReference),
              const Divider(),
              InfoRow(label: 'Client', value: invoice.clientName),
              const Divider(),
              InfoRow(label: 'Date', value: Fmt.date(invoice.createdAt)),
              if (isPaid && payment?.createdAt != null) ...[
                const Divider(),
                InfoRow(
                  label: 'Date de paiement',
                  value: Fmt.date(payment!.createdAt),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppCard(
          variant: AppCardVariant.filled,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Montant total',
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
                ),
              ),
              Text(
                Fmt.money(invoice.totalAmount),
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        SectionHeader(title: 'Lignes (${invoice.lines.length})'),
        if (invoice.lines.isEmpty)
          AppCard(
            child: EmptyState(
              title: 'Aucune ligne',
              message: 'Ce document ne comporte aucune ligne de détail.',
              icon: Icons.list_alt_rounded,
            ),
          )
        else
          AppCard(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            child: Column(
              children: [
                for (var i = 0; i < invoice.lines.length; i++) ...[
                  if (i > 0) const Divider(),
                  _LineRow(line: invoice.lines[i]),
                ],
              ],
            ),
          ),
        if (invoice.notes != null && invoice.notes!.trim().isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          SectionHeader(
            title: 'Informations du technicien',
            subtitle: "Précisions qui n'entrent pas dans le montant.",
          ),
          AppCard(
            child: Text(
              invoice.notes!,
              style: TextStyle(color: colors.onSurface, fontSize: 14),
            ),
          ),
        ],
        if (payment != null) ...[
          const SizedBox(height: AppSpacing.md),
          SectionHeader(title: 'Paiement'),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Moyen de paiement',
                        style: TextStyle(
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    StatusBadge.payment(payment.status, dense: true),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  payment.operator == null
                      ? payment.channel.label
                      : '${payment.channel.label} ${payment.operator!.label}',
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                InfoRow(label: 'Montant', value: Fmt.money(payment.amount)),
                if (payment.transactionRef != null)
                  InfoRow(
                    label: 'Référence de la transaction',
                    value: payment.transactionRef!,
                  ),
                if (payment.reference != null)
                  InfoRow(label: 'Référence', value: payment.reference!),
                InfoRow(label: 'Date', value: Fmt.date(payment.createdAt)),
                if (payment.proofUrl != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Preuve de paiement',
                    style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  SelectableText(
                    payment.proofUrl!,
                    style: TextStyle(color: colors.primary, fontSize: 13),
                  ),
                ],
              ],
            ),
          ),
        ],
        if (payment == null && invoice.totalAmount > 0) ...[
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Régler le devis',
            icon: Icons.payments_rounded,
            onPressed: () => _pay(context, ref),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});

  final InvoiceLine line;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.description,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
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
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
