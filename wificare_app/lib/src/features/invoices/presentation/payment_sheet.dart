import 'package:flutter/material.dart';

import '../../../core/domain/enums.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_input.dart';

/// Moyen de paiement retenu par le client.
class PaymentChoice {
  const PaymentChoice({
    required this.channel,
    this.operator,
    this.transactionRef,
  });

  const PaymentChoice.cash()
    : channel = PaymentChannel.cash,
      operator = null,
      transactionRef = null;

  final PaymentChannel channel;
  final MobileMoneyOperator? operator;
  final String? transactionRef;

  bool get isCash => channel == PaymentChannel.cash;
}

/// Choix du moyen de règlement d'un devis.
///
/// Les règlements en espèces et par Mobile Money ne séparent pas de la même
/// façon : en espèces, le client remet la somme au technicien ; par Mobile
/// Money, il paie de son côté. La feuille le dit explicitement, sinon le client
/// valide en croyant avoir payé au technicien.
Future<PaymentChoice?> showPaymentSheet(
  BuildContext context, {
  required double amount,
  required String ticketReference,
}) {
  return showModalBottomSheet<PaymentChoice>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _PaymentSheet(amount: amount, reference: ticketReference),
  );
}

class _PaymentSheet extends StatefulWidget {
  const _PaymentSheet({required this.amount, required this.reference});

  final double amount;
  final String reference;

  @override
  State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  PaymentChannel _channel = PaymentChannel.cash;
  MobileMoneyOperator? _operator;
  final _transactionRef = TextEditingController();

  @override
  void dispose() {
    _transactionRef.dispose();
    super.dispose();
  }

  void _submit() {
    Navigator.of(context).pop(
      PaymentChoice(
        channel: _channel,
        operator: _channel == PaymentChannel.mobileMoney ? _operator : null,
        transactionRef: _transactionRef.text.trim().isEmpty
            ? null
            : _transactionRef.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    final canSubmit =
        _channel != PaymentChannel.mobileMoney || _operator != null;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _header(colors),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppCard(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Montant à régler',
                          style: TextStyle(color: colors.onSurfaceVariant),
                        ),
                        Text(
                          Fmt.money(widget.amount),
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    'Moyen de paiement',
                    style: TextStyle(
                      color: colors.onSurface,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _channelTile(
                    colors,
                    PaymentChannel.cash,
                    Icons.payments_outlined,
                    'Espèces',
                    'Vous remittez la somme au technicien.',
                  ),
                  _channelTile(
                    colors,
                    PaymentChannel.mobileMoney,
                    Icons.smartphone_rounded,
                    'Mobile Money',
                    'Vous payez de votre côté, puis le technicien confirme.',
                  ),
                  if (_channel == PaymentChannel.mobileMoney) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'Opérateur',
                      style: TextStyle(
                        color: colors.onSurface,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        for (final operator in MobileMoneyOperator.values)
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(right: AppSpacing.sm),
                              child: _operatorTile(colors, operator),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppInput(
                      label: 'Référence de la transaction',
                      hint: 'Facultatif',
                      controller: _transactionRef,
                      textInputAction: TextInputAction.done,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    _notice(
                      colors,
                      Icons.info_outline_rounded,
                      'Effectuez le paiement depuis votre application '
                          'Mobile Money, puis validez ici pour le déclarer au '
                          'technicien.',
                    ),
                  ],
                  if (_channel == PaymentChannel.cash) ...[
                    const SizedBox(height: AppSpacing.md),
                    _notice(
                      colors,
                      Icons.info_outline_rounded,
                      'Validez puis remettez la somme au technicien. Le devis '
                          'sera marqué comme réglé.',
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    label: 'Valider le paiement',
                    icon: Icons.check_rounded,
                    onPressed: canSubmit ? _submit : null,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header(WiFiColors colors) => Padding(
    padding: const EdgeInsets.all(AppSpacing.md),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Régler le devis',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
              Text(
                widget.reference,
                style: TextStyle(fontSize: 13, color: colors.onSurfaceVariant),
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.close_rounded),
        ),
      ],
    ),
  );

  Widget _channelTile(
    WiFiColors colors,
    PaymentChannel channel,
    IconData icon,
    String title,
    String subtitle,
  ) {
    final selected = _channel == channel;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: InkWell(
        onTap: () => setState(() => _channel = channel),
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(
              color: selected ? colors.primary : colors.outlineVariant,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                icon,
                color: selected ? colors.primary : colors.onSurfaceVariant,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_off_rounded,
                color: selected ? colors.primary : colors.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _operatorTile(WiFiColors colors, MobileMoneyOperator operator) {
    final selected = _operator == operator;

    return InkWell(
      onTap: () => setState(() => _operator = operator),
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(
            color: selected ? operator.color : colors.outlineVariant,
            width: selected ? 2 : 1,
          ),
        ),
        child: Text(
          operator.label,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected ? colors.onSurface : colors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }

  Widget _notice(WiFiColors colors, IconData icon, String message) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 18, color: colors.onSurfaceVariant),
      const SizedBox(width: AppSpacing.sm),
      Expanded(
        child: Text(
          message,
          style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
        ),
      ),
    ],
  );
}