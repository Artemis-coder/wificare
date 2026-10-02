import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_button.dart';

/// Rapport de fin d'intervention.
///
/// Il est demandé au moment où la demande est marquée terminée, parce que c'est
/// le dernier instant où le technicien sait encore ce qu'il a fait sans avoir
/// à le retrouver. Après, l'information est reconstituée de mémoire, ou pas
/// du tout.
///
/// Le rapport n'est pas une formalité : c'est la seule trace écrite de ce qui
/// a été fait dans l'installation du client. La régie le lit quand le client se
/// plaint, le technicien reprend le fil d'un dossier archivé, et le prochain
/// technicien comprend ce qui a déjà été tenté. Une demande close sans rapport
/// laisse un trou que rien ne comble ensuite.
///
/// Le diagnostic est demandé aussi, et non facultatif : les deux disent des
/// choses différentes. Le diagnostic est ce qui a été constaté, le rapport ce
/// qui a été fait. Les confondre fait perdre l'un des deux au premier
/// technicien qui reprend le dossier.
class ClosureReportSheet extends StatefulWidget {
  const ClosureReportSheet({
    super.key,
    required this.reference,
    this.diagnostic,
    this.solution,
  });

  final String reference;

  /// Déjà saisi, si le technicien repasse par là : la fenêtre corrige alors un
  /// rapport existant au lieu d'en proposer un second.
  final String? diagnostic;
  final String? solution;

  /// Renvoie le rapport, ou `null` si le technicien a renoncé.
  static Future<ClosureReport?> show(
    BuildContext context, {
    required String reference,
    String? diagnostic,
    String? solution,
  }) {
    return showModalBottomSheet<ClosureReport>(
      context: context,
      isScrollControlled: true,
      builder: (_) => ClosureReportSheet(
        reference: reference,
        diagnostic: diagnostic,
        solution: solution,
      ),
    );
  }

  @override
  State<ClosureReportSheet> createState() => _ClosureReportSheetState();
}

class _ClosureReportSheetState extends State<ClosureReportSheet> {
  late final TextEditingController _diagnostic =
      TextEditingController(text: widget.diagnostic);
  late final TextEditingController _solution =
      TextEditingController(text: widget.solution);

  String? _error;

  @override
  void dispose() {
    _diagnostic.dispose();
    _solution.dispose();
    super.dispose();
  }

  void _submit() {
    final diagnostic = _diagnostic.text.trim();
    final solution = _solution.text.trim();

    // Les deux sont exigés : une demande close sans écrit ne laisse aucune
    // trace, et c'est précisément ce que la clôture doit empêcher.
    if (diagnostic.isEmpty) {
      setState(() => _error = 'Ce qui a été constaté est obligatoire.');
      return;
    }

    if (solution.isEmpty) {
      setState(() => _error = 'Ce qui a été fait est obligatoire.');
      return;
    }

    Navigator.of(context).pop(
      ClosureReport(diagnostic: diagnostic, solution: solution),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      // La feuille monte avec le clavier : sans ce réglage, le champ de
      // diagnostic se retrouve caché derrière les touches au moment où le
      // technicien écrit — c'est-à-dire toujours.
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Rapport d\'intervention',
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Demande ${widget.reference} — ce rapport reste joint à la '
                'demande après clôture.',
                style: TextStyle(
                  color: colors.onSurfaceVariant,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              _Field(
                label: 'Diagnostic',
                hint: 'Ce qui a été constaté sur place.',
                controller: _diagnostic,
              ),
              const SizedBox(height: AppSpacing.md),
              _Field(
                label: 'Interventions réalisées',
                hint: 'Ce qui a été fait, et ce qui reste à faire.',
                controller: _solution,
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  _error!,
                  style: TextStyle(color: colors.error, fontSize: 13),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: 'Enregistrer et terminer',
                onPressed: _submit,
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: 'Annuler',
                variant: AppButtonVariant.ghost,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.hint,
    required this.controller,
  });

  final String label;
  final String hint;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: colors.onSurface,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        TextField(
          controller: controller,
          maxLines: 4,
          textInputAction: TextInputAction.newline,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: colors.onSurfaceVariant, fontSize: 14),
            border: const OutlineInputBorder(),
            contentPadding: const EdgeInsets.all(12),
          ),
        ),
      ],
    );
  }
}

/// Rapport saisi par le technicien.
class ClosureReport {
  const ClosureReport({required this.diagnostic, required this.solution});

  final String diagnostic;
  final String solution;
}
