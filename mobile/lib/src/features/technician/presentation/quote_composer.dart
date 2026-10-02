import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_input.dart';
import '../../../core/widgets/states.dart';

/// Ligne de devis en cours de saisie.
///
/// Les contrôleurs vivent dans la ligne : `AppInput` les exige, et ils doivent
/// vivre exactement aussi longtemps que le champ qu'ils pilotent.
class QuoteDraftLine {
  QuoteDraftLine({this.quantity = 1, this.unitPrice = 0})
    : description = TextEditingController(),
      quantityController = TextEditingController(text: '1'),
      priceController = TextEditingController();

  final TextEditingController description;
  final TextEditingController quantityController;
  final TextEditingController priceController;

  double quantity;
  double unitPrice;

  void dispose() {
    description.dispose();
    quantityController.dispose();
    priceController.dispose();
  }

  double get total => quantity * unitPrice;

  bool get isValid => description.text.trim().isNotEmpty && quantity > 0 && unitPrice > 0;
}

/// Rédaction d'un devis, renvoyé au client.
///
/// Le technicien décrit ce qu'il a fait ligne par ligne, puis peut ajouter des
/// observations qui n'entrent pas dans le montant — ce que la facture
/// n'exprime pas et que le client doit néanmoins savoir.
///
/// L'envoi est définitif : le devis part chez le client et n'est plus
/// modifiable. La fenêtre le dit explicitement plutôt que de laisser découvrir
/// la conséquence après coup.
/// Devis complet : les lignes chiffrées et les observations libres.
class QuoteDraft {
  const QuoteDraft({required this.lines, this.notes});

  final List<QuoteDraftLine> lines;
  final String? notes;

  double get total => lines.fold(0, (sum, line) => sum + line.total);
}

Future<QuoteDraft?> showQuoteComposer(
  BuildContext context, {
  required String ticketReference,
}) {
  return showModalBottomSheet<QuoteDraft>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _QuoteComposer(ticketReference: ticketReference),
  );
}

class _QuoteComposer extends StatefulWidget {
  const _QuoteComposer({required this.ticketReference});

  final String ticketReference;

  @override
  State<_QuoteComposer> createState() => _QuoteComposerState();
}

class _QuoteComposerState extends State<_QuoteComposer> {
  final _lines = <QuoteDraftLine>[QuoteDraftLine()];
  final _notes = TextEditingController();

  @override
  void dispose() {
    _notes.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  double get _total =>
      _lines.fold(0, (sum, line) => sum + line.total);

  void _addLine() {
    setState(() => _lines.add(QuoteDraftLine()));
  }

  void _removeLine(int index) {
    if (_lines.length == 1) return;

    setState(() => _lines.removeAt(index).dispose());
  }

  void _submit() {
    final notes = _notes.text.trim();

    Navigator.of(context).pop(
      QuoteDraft(
        lines: _lines.where((line) => line.isValid).toList(),
        notes: notes.isEmpty ? null : notes,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, controller) => Column(
          children: [
            _handle(context, colors),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  SectionHeader(
                    title: 'Travaux réalisés',
                    subtitle:
                        'Décrivez chaque prestation. Le total est calculé pour vous.',
                  ),
                  for (var index = 0; index < _lines.length; index++)
                    _lineField(index),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: _addLine,
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Ajouter une ligne'),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const SectionHeader(
                    title: 'Informations complémentaires',
                    subtitle:
                        'Facultatif : précisions qui n\'entrent pas dans le montant.',
                  ),
                  AppInput(
                    controller: _notes,
                    label: 'Observations',
                    hint: 'Garantie, pièces utilisées, Recommandations…',
                    maxLines: 4,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _totalRow(colors),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'L\'envoi est définitif : le client sera prévenu et le devis ne sera plus modifiable.',
                    style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            _actions(colors),
          ],
        ),
      ),
    );
  }

  Widget _handle(BuildContext context, dynamic colors) => Padding(
    padding: const EdgeInsets.fromLTRB(
      AppSpacing.md,
      AppSpacing.sm,
      AppSpacing.sm,
      AppSpacing.sm,
    ),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Établir le devis',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
              Text(
                widget.ticketReference,
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

  Widget _lineField(int index) {
    final line = _lines[index];

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: AppInput(
                  label: 'Prestation',
                  hint: 'Remplacement du routeur',
                  controller: line.description,
                ),
              ),
              if (_lines.length > 1)
                IconButton(
                  onPressed: () => _removeLine(index),
                  icon: const Icon(Icons.delete_outline_rounded),
                  tooltip: 'Retirer cette ligne',
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: AppInput(
                  label: 'Quantité',
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                  ],
                  controller: line.quantityController,
                  onChanged: (value) =>
                      line.quantity = double.tryParse(value) ?? 0,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppInput(
                  label: 'Prix unitaire',
                  suffix: const Text('FCFA'),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  controller: line.priceController,
                  onChanged: (value) =>
                      line.unitPrice = double.tryParse(value) ?? 0,
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text(
              'Total : ${Fmt.money(line.total)}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  Widget _totalRow(dynamic colors) => AppCard(
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('Total du devis', style: TextStyle(color: colors.onSurfaceVariant)),
        Text(
          Fmt.money(_total),
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: _total > 0 ? colors.primary : colors.error,
          ),
        ),
      ],
    ),
  );

  Widget _actions(dynamic colors) {
    final canSubmit = _lines.any((line) => line.isValid) && _total > 0;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: SizedBox(
        width: double.maxFinite,
        child: AppButton(
          label: 'Valider et envoyer',
          icon: Icons.send_rounded,
          onPressed: canSubmit ? _submit : null,
        ),
      ),
    );
  }
}