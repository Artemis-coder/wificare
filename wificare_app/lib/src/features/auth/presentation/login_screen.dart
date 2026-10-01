import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_input.dart';
import '../../../core/widgets/states.dart';
import '../application/auth_controller.dart';
import 'widgets/account_type_selector.dart';

/// Connexion au compte.
///
/// L'utilisateur choisit son type de compte, saisit son téléphone et son mot
/// passe de 4 chiffres.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();

  AccountType _accountType = AccountType.wifiZoneOwner;
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

  Future<void> _submit() async {
    _clearErrors();

    final phone = Fmt.normalizePhone(_phoneController.text);
    final password = _passwordController.text.trim();

    if (phone.length < 8) {
      _reportError('Saisissez un numéro de téléphone valide.', field: 'phone');
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
      await ref.read(authControllerProvider.notifier).loginWithPassword(
            phone: phone,
            password: password,
            accountType: _accountType,
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
                  Align(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: colors.primary,
                        borderRadius: BorderRadius.circular(AppRadius.xl),
                      ),
                      child: const Icon(
                        Icons.wifi_rounded,
                        color: Colors.white,
                        size: 36,
                      ),
                    ),
                  ),
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
                          hint: '+225 01 02 03 04 05',
                          required: true,
                          errorText: _phoneError,
                          variant: AppInputVariant.phone,
                          prefixIcon: Icons.phone_rounded,
                          textInputAction: TextInputAction.next,
                          onChanged: (_) {
                            if (_phoneError != null) {
                              setState(() => _phoneError = null);
                            }
                          },
                        ),
                        const SizedBox(height: AppSpacing.md),
                        AppInput(
                          controller: _passwordController,
                          label: 'Mot de passe',
                          hint: '$kPasswordLength chiffres',
                          required: true,
                          errorText: _passwordError,
                          variant: AppInputVariant.password,
                          prefixIcon: Icons.lock_outline_rounded,
                          textInputAction: TextInputAction.done,
                          onChanged: (value) {
                            if (_passwordError != null) {
                              setState(() => _passwordError = null);
                            }
                          },
                          onSubmitted: _busy ? null : _submit,
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
}