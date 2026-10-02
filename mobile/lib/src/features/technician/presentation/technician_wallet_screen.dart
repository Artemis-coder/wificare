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
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../application/technician_providers.dart';

/// Portefeuille du technicien : ce que ses clients lui ont réglé.
///
/// Trois lectures, dans l'ordre où on les cherche : **ce mois-ci**, **le
/// cumulé**, puis le détail mois par mois et règlement par règlement. Le chiffre
/// du mois est en premier parce que c'est celui qui sert à décider si le mois
/// se passe bien ; le cumulé répond à « depuis que j'utilise l'application ».
class TechnicianWalletScreen extends ConsumerWidget {
  const TechnicianWalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(technicianWalletProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mon portefeuille')),
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorView(
            error: error,
            onRetry: () => ref.invalidate(technicianWalletProvider),
          ),
          data: (wallet) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(technicianWalletProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.xxl,
              ),
              children: [
                _Totals(wallet: wallet),
                const SizedBox(height: AppSpacing.lg),

                if (wallet.isEmpty)
                  const AppCard(
                    child: EmptyState(
                      title: 'Aucun règlement pour l\'instant',
                      message:
                          'Vos encaissements apparaîtront ici dès qu\'un client '
                          'réglera un devis que vous avez réalisé.',
                      icon: Icons.account_balance_wallet_outlined,
                    ),
                  )
                else ...[
                  if (wallet.byChannel.isNotEmpty) ...[
                    const SectionHeader(title: 'Par moyen de paiement'),
                    AppCard(
                      child: Column(
                        children: [
                          for (final entry in wallet.byChannel.entries) ...[
                            if (entry.key != wallet.byChannel.keys.first)
                              const Divider(),
                            InfoRow(
                              // Un moyen de paiement peut apparaître chez
                              // plusieurs opérateurs : on n'en garde qu'un seul
                              // libellé, l'opérateur étant un détail du
                              // règlement, pas du total.
                              label: entry.key.label,
                              value: Fmt.money(entry.value),
                              icon: _channelIcon(entry.key),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],

                  if (wallet.monthly.isNotEmpty) ...[
                    SectionHeader(
                      title: 'Mois par mois',
                      subtitle:
                          '${wallet.paidInterventions} intervention'
                          '${wallet.paidInterventions == 1 ? '' : 's'} payée'
                          '${wallet.paidInterventions == 1 ? '' : 's'} au total.',
                    ),
                    for (final month in wallet.monthly)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: _MonthRow(month: month),
                      ),
                    const SizedBox(height: AppSpacing.lg),
                  ],

                  SectionHeader(
                    title: 'Derniers règlements',
                    subtitle: 'La trace de chaque encaissement.',
                  ),
                  for (final payment in wallet.payments)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: _PaymentRow(payment: payment),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static IconData _channelIcon(PaymentChannel channel) => switch (channel) {
    PaymentChannel.cash => Icons.payments_outlined,
    PaymentChannel.mobileMoney => Icons.smartphone_rounded,
    PaymentChannel.bankTransfer => Icons.account_balance_outlined,
  };
}

/// Cumulé et mois en cours, les deux chiffres que l'on consulte.
class _Totals extends StatelessWidget {
  const _Totals({required this.wallet});

  final TechnicianWallet wallet;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Column(
      children: [
        // Le mois en cours passe devant le cumulé : c'est l'information la plus
        // fraîche, et celle qui décide si le mois se passe bien.
        AppCard(
          variant: AppCardVariant.filled,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Encaissé en ${wallet.currentMonthLabel}',
                      style: TextStyle(
                        color: colors.onSurfaceVariant,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  Icon(Icons.calendar_today_rounded, color: colors.primary, size: 16),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  Fmt.money(wallet.currentMonthAmount),
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 30,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Expanded(
              child: StatTile(
                label: 'Total encaissé',
                value: Fmt.money(wallet.totalAmount),
                icon: Icons.savings_outlined,
                color: colors.success,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: StatTile(
                label: 'Interventions payées',
                value: '${wallet.paidInterventions}',
                icon: Icons.handyman_outlined,
                color: colors.secondary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Un mois : son montant et le nombre de règlements qu'il contient.

class _MonthRow extends StatelessWidget {
  const _MonthRow({required this.month});

  final WalletMonth month;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  month.label,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${month.count} règlement'
                  '${month.count == 1 ? '' : 's'}',
                  style: TextStyle(
                    color: colors.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Text(
            Fmt.money(month.amount),
            style: TextStyle(
              color: colors.onSurface,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Un règlement, avec la demande qu'il solde.
///
/// Cliquable : le technicien doit pouvoir aller voir l'intervention concernée
/// sans avoir à la retrouver dans la liste des demandes.
class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.payment});

  final WalletPayment payment;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      onTap: () => context.push(
        '${TechnicianRoutes.tickets}/${payment.ticketId}',
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        payment.ticketReference,
                        style: TextStyle(
                          color: colors.onSurface,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    StatusBadge.ticket(payment.ticketStatus, dense: true),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${_paymentMethod(payment)} · ${Fmt.since(payment.paidAt)}',
                  style: TextStyle(
                    color: colors.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            Fmt.money(payment.amount),
            style: TextStyle(
              color: colors.success,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  static String _paymentMethod(WalletPayment payment) {
    final channel = payment.channel;

    if (channel == PaymentChannel.mobileMoney && payment.operator != null) {
      return '${channel.label} ${payment.operator!.label}';
    }

    return channel.label;
  }
}
