import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/phone_countries.dart';
import '../../../core/utils/phone_country_data.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_input.dart';
import '../../../core/widgets/app_logo.dart';
import '../../../core/widgets/phone_country_picker.dart';
import '../../../core/widgets/states.dart';
import '../application/auth_controller.dart';
import 'widgets/account_type_selector.dart';

/// Connexion au compte.
///
/// L'utilisateur choisit son type de compte, son pays, saisit son téléphone et
/// son mot de passe de 4 chiffres.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();

  AccountType _accountType = AccountType.wifiZoneOwner;
  late PhoneCountryData _country = PhoneCountries.defaultCountry;

  /// Rester connecté est un choix, pas un défaut : la session ne survit pas à
  /// la fermeture de l'application tant que la case n'est pas cochée.
  bool _remember = false;

  String? _phoneError;
  String? _passwordError;
  String? _accountTypeError;
  bool _busy = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  /// Affiche un message éphémère et signale le champ fautif à l'écran.
  void _reportError(String message, {String? field}) {
    if (!mounted) return;

    setState(() {
      if (field == 'phone') {
        _phoneError = message;
      } else if (field == 'password') {
        _passwordError = message;
      } else if (field == 'accountType') {
        _accountTypeError = message;
      }
    });

    showAppSnackBar(context, message, isError: true);
  }

  void _clearErrors() {
    setState(() {
      _phoneError = null;
      _passwordError = null;
      _accountTypeError = null;
    });
  }

  /// Changer de pays change le plan de numérotation : le message affiché vient
  /// de l'ancien pays, et le laisser en place enverrait l'utilisateur vers une
  /// erreur qui ne le concerne plus.
  void _chooseCountry(PhoneCountryData country) {
    setState(() {
      _country = country;
      _phoneError = null;
    });
  }

  Future<void> _submit() async {
    _clearErrors();

    final typed = _phoneController.text.trim();
    final password = _passwordController.text.trim();

    final validation = PhoneCountries.validate(_country, typed);

    if (!validation.isAccepted) {
      _reportError(validation.message!, field: 'phone');
      return;
    }

    if (password.length != kPasswordLength) {
      _reportError(
        'Le mot de passe comporte $kPasswordLength chiffres.',
        field: 'password',
      );
      return;
    }

    setState(() => _busy = true);

    try {
      await ref
          .read(authControllerProvider.notifier)
          .loginWithPassword(
            phone: validation.e164,
            password: password,
            accountType: _accountType,
            remember: _remember,
          );
    } on ApiException catch (error) {
      // Un `403` signifie que le type de compte choisi ne correspond pas au
      // numéro saisi. Le message est rattaché au sélecteur : sous le champ mot
      // de passe, il laisserait croire à un mot de passe erroné.
      if (error.statusCode == 403) {
        _reportError(error.message, field: 'accountType');
      } else {
        _reportError(error.message, field: 'password');
      }
    } catch (_) {
      _reportError('Connexion impossible. Réessayez.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: AppSpacing.xl),
                  const Center(child: AppLogo(size: 88)),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'WiFi Care',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: colors.onSurface,
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Signalez une panne et suivez son traitement',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: colors.onSurfaceVariant, fontSize: 14),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  AccountTypeSelector(
                    value: _accountType,
                    enabled: !_busy,
                    onChanged: (type) => setState(() {
                      _accountType = type;
                      // Changer de type résout la confusion : le message
                      // signalait un écart entre le type choisi et le numéro.
                      _accountTypeError = null;
                    }),
                  ),
                  // Message persistant, en plus du toast : un simple toast peut
                  // être manqué, et celui-ci indique où se trouve l'erreur.
                  if (_accountTypeError != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    ErrorBanner(message: _accountTypeError!),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  AppCard(
                    variant: AppCardVariant.elevated,
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        AppInput(
                          controller: _phoneController,
                          label: 'Téléphone',
                          hint: _country.example,
                          helperText: _phoneHelper(),
                          required: true,
                          errorText: _phoneError,
                          variant: AppInputVariant.phone,
                          enabled: !_busy,
                          leading: PhoneCountryPicker(
                            country: _country,
                            enabled: !_busy,
                            onChanged: _chooseCountry,
                          ),
                          // La longueur admise dépend du pays : la borne par
                          // défaut laisserait taper treize chiffres dans un plan
                          // à huit, et le message d'erreur arriverait trop tard.
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(_country.maxDigits),
                          ],
                          textInputAction: TextInputAction.next,
                          // Le compte de caractères restants se lit sous le
                          // champ : il avance donc à chaque frappe, même
                          // lorsqu'aucune erreur n'est affichée.
                          onChanged: (_) => setState(() => _phoneError = null),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        AppInput(
                          controller: _passwordController,
                          label: 'Mot de passe',
                          hint: '$kPasswordLength chiffres',
                          required: true,
                          errorText: _passwordError,
                          variant: AppInputVariant.password,
                          enabled: !_busy,
                          prefixIcon: Icons.lock_outline_rounded,
                          textInputAction: TextInputAction.done,
                          onChanged: (value) {
                            if (_passwordError != null) {
                              setState(() => _passwordError = null);
                            }
                          },
                          onSubmitted: _busy ? null : _submit,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        _RememberToggle(
                          value: _remember,
                          enabled: !_busy,
                          onChanged: (value) => setState(() => _remember = value),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        AppButton(
                          label: 'Se connecter',
                          loading: _busy,
                          size: AppButtonSize.lg,
                          onPressed: _busy ? null : _submit,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Column(
                    children: [
                      Text(
                        "Pas encore de compte ?",
                        textAlign: TextAlign.center,
                        style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
                      ),
                      TextButton(
                        onPressed: _busy ? null : () => context.push('/register'),
                        child: const Text('Créer un compte'),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    '© ${DateTime.now().year} WiFi Care — version 1.0.0',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: colors.onSurfaceVariant, fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Rappel de la forme attendue, une fois le pays choisi.
  ///
  /// Le compte se fait pendant la saisie : afficher « 10 / 10 chiffres » dès le
  /// départ laisserait croire que le champ est déjà complet, et ne rien afficher
  /// obligerait l'utilisateur à compter ses chiffres un par un.
  String? _phoneHelper() {
    if (_phoneError != null) return null;

    final typed = _phoneController.text;
    final remaining = _country.lengths.first - typed.length;

    final rest = remaining > 0 && typed.isNotEmpty
        ? 'encore $remaining chiffre${remaining > 1 ? 's' : ''} · '
        : '';

    return '$rest${_country.digitsLabel} · ex. ${_country.example}';
  }
}

/// Case « rester connecté ».
///
/// La case est décochée par défaut : retenir une session est une décision de
/// l'utilisateur, sur un téléphone qui peut être partagé. Elle est sous le mot
/// de passe et au-dessus du bouton, là où la main se trouve déjà.
class _RememberToggle extends StatelessWidget {
  const _RememberToggle({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Semantics(
      checked: value,
      child: InkWell(
        onTap: enabled ? () => onChanged(!value) : null,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Row(
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Checkbox(
                  value: value,
                  onChanged: enabled ? (checked) => onChanged(checked ?? false) : null,
                  activeColor: colors.primary,
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'Rester connecté sur ce téléphone',
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}