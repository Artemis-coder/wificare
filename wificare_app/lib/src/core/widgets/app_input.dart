import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Longueur du mot de passe de compte (4 chiffres), alignée sur l'API.
const int kPasswordLength = 4;

enum AppInputVariant { text, phone, otp, password, multiline }

/// Champ de saisie avec label, état d'erreur et texte d'aide.
class AppInput extends StatefulWidget {
  const AppInput({
    super.key,
    required this.controller,
    this.label,
    this.hint,
    this.helperText,
    this.errorText,
    this.required = false,
    this.enabled = true,
    this.variant = AppInputVariant.text,
    this.maxLength,
    this.prefixIcon,
    this.suffix,
    this.focusNode,
    this.keyboardType,
    this.inputFormatters,
    this.maxLines,
    this.onChanged,
    this.onSubmitted,
    this.textInputAction,
  });

  final TextEditingController controller;
  final String? label;
  final String? hint;
  final String? helperText;
  final String? errorText;
  final bool required;
  final bool enabled;
  final AppInputVariant variant;
  final int? maxLength;
  final IconData? prefixIcon;
  final Widget? suffix;
  final FocusNode? focusNode;

  /// Surcharge le clavier déduit de la variante : une saisie de montant n'a
  /// pas le même clavier qu'un texte, et la liste des lignes d'un devis comme
  /// le paiement en dépendent.
  final TextInputType? keyboardType;

  /// Contraintes de saisie additionnelles, appliquées après celles de la
  /// variante. S'y substituent : un prix décimal n'a pas à hériter du filtre
  /// « chiffres uniquement » d'un mot de passe.
  final List<TextInputFormatter>? inputFormatters;

  final int? maxLines;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onSubmitted;
  final TextInputAction? textInputAction;

  @override
  State<AppInput> createState() => _AppInputState();
}

class _AppInputState extends State<AppInput> {
  late final FocusNode _focusNode = widget.focusNode ?? FocusNode();

  @override
  void dispose() {
    if (widget.focusNode == null) _focusNode.dispose();
    super.dispose();
  }

  List<TextInputFormatter> get _formatters => widget.inputFormatters ?? switch (widget.variant) {
    AppInputVariant.phone => [
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(15),
    ],
    AppInputVariant.otp => [
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(6),
    ],
    AppInputVariant.password => [
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(kPasswordLength),
    ],
    _ => const [],
  };

  TextInputType get _keyboardType => widget.keyboardType ?? switch (widget.variant) {
    AppInputVariant.phone => TextInputType.phone,
    AppInputVariant.otp => TextInputType.number,
    AppInputVariant.password => TextInputType.number,
    AppInputVariant.multiline => TextInputType.multiline,
    AppInputVariant.text => TextInputType.text,
  };

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final isMultiline = widget.variant == AppInputVariant.multiline;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.label != null)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Text.rich(
              TextSpan(
                text: widget.label,
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
                children: widget.required
                    ? [
                        TextSpan(
                          text: ' *',
                          style: TextStyle(
                            color: colors.error,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ]
                    : null,
              ),
            ),
          ),
        TextField(
          controller: widget.controller,
          focusNode: _focusNode,
          enabled: widget.enabled,
          onChanged: widget.onChanged,
          onSubmitted: widget.onSubmitted == null
              ? null
              : (_) => widget.onSubmitted!(),
          keyboardType: _keyboardType,
          textInputAction: widget.textInputAction,
          inputFormatters: _formatters,
          obscureText: widget.variant == AppInputVariant.password,
          maxLines: widget.maxLines ?? (isMultiline ? 5 : 1),
          minLines: isMultiline ? 3 : 1,
          maxLength: widget.maxLength,
          style: TextStyle(color: colors.onSurface, fontSize: 16),
          decoration: InputDecoration(
            hintText: widget.hint,
            hintStyle: TextStyle(color: colors.onSurfaceVariant, fontSize: 15),
            errorText: widget.errorText,
            helperText: widget.helperText,
            helperMaxLines: 2,
            errorMaxLines: 2,
            prefixIcon: widget.prefixIcon == null
                ? null
                : Icon(widget.prefixIcon, size: 20, color: colors.onSurfaceVariant),
            suffixIcon: widget.suffix,
            counterText: '',
          ),
        ),
      ],
    );
  }
}
