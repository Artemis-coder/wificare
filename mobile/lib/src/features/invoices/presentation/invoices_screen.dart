import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_card.dart';import '../../../core/widgets/app_button.dart';

import '../../../core/widgets/filter_bar.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../application/invoice_providers.dart';

final invoiceListProvider = FutureProvider.autoDispose<List<QuoteInvoice>>((
  ref,
) async {
  final clientId = ref.watch(clientAccountProvider)?.id;
  if (clientId == null) return const [];
  return ref.read(invoiceRepositoryProvider).list(clientId: clientId);
});

/// Devis et factures du client connecté.
class InvoicesScreen extends ConsumerStatefulWidget {
  const InvoicesScreen({super.key});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  DocumentStatus? _status;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(invoiceListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mes factures')),
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorView(
            error: error,
            onRetry: () => ref.invalidate(invoiceListProvider),
          ),
          data: (invoices) => _buildContent(context, invoices),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, List<QuoteInvoice> invoices) {
    final colors = context.colors;
    final visible = _status == null
        ? invoices
        : invoices.where((i) => i.status == _status).toList();

    final paidTotal = invoices
        .where((i) => i.payment?.status == PaymentStatus.completed)
        .fold<double>(0, (sum, i) => sum + i.totalAmount);
    final pendingTotal = invoices
        .where((i) => i.payment?.status != PaymentStatus.completed)
        .fold<double>(0, (sum, i) => sum + i.totalAmount);

    return RefreshIndicator(
      onRefresh: () => ref.refresh(invoiceListProvider.future),
      child: ListView(
        padding: const EdgeInsets.only(bottom: AppSpacing.xl),
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Résumé', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: StatTile(
                          label: 'Total réglé',
                          value: Fmt.money(paidTotal),
                          icon: Icons.check_circle_outline_rounded,
                          color: colors.success,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: StatTile(
                          label: 'En attente',
                          value: Fmt.money(pendingTotal),
                          icon: Icons.schedule_rounded,
                          color: colors.warning,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          FilterBar<DocumentStatus?>(
            items: [null, ...DocumentStatus.values],
            selected: _status,
            labelOf: (status) => status?.label ?? 'Tous',
            onChanged: (status) => setState(() => _status = status),
          ),
          const SizedBox(height: AppSpacing.md),
          if (visible.isEmpty)
            EmptyState(
              title: invoices.isEmpty ? 'Aucun document' : 'Aucun résultat',
              message: invoices.isEmpty
                  ? 'Vos devis et factures apparaîtront ici.'
                  : 'Aucun document ne correspond à ce filtre.',
              icon: Icons.receipt_long_rounded,
              action: _status == null
                  ? null
                  : AppButton(
                      label: 'Réinitialiser le filtre',
                      variant: AppButtonVariant.outline,
                      expand: false,
                      onPressed: () => setState(() => _status = null),
                    ),
            )
          else
            for (final invoice in visible)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  0,
                  AppSpacing.md,
                  AppSpacing.sm,
                ),
                child: _InvoiceCard(invoice: invoice),
              ),
        ],
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final QuoteInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final icon = switch (invoice.type) {
      DocumentType.quote => Icons.request_quote_outlined,
      DocumentType.invoice => Icons.receipt_long_rounded,
    };
    final isPaid = invoice.status == DocumentStatus.paid;

    return AppCard(
      onTap: () => context.push('${Routes.invoices}/${invoice.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Icon(icon, size: 22, color: colors.primary),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      invoice.type.label,
                      style: TextStyle(
                        color: colors.onSurface,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Ticket ${invoice.ticketReference}',
                      style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              StatusBadge.document(invoice.status),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: Text(
                  Fmt.money(invoice.totalAmount),
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Text(
                Fmt.date(invoice.createdAt),
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
            ],
          ),
          if (!isPaid) ...[
            const SizedBox(height: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: colors.warning.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, size: 15, color: colors.warning),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Text(
                      'Paiement en attente',
                      style: TextStyle(color: colors.warning, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
