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
import '../../../core/widgets/phone_country_picker.dart';
import '../../../core/widgets/states.dart';
import '../application/auth_controller.dart';
import 'widgets/account_type_selector.dart';

/// Étapes de l'inscription.
enum RegisterStep { personal, zone, security }

extension RegisterStepX on RegisterStep {
  String get title => switch (this) {
    RegisterStep.personal => 'Informations personnelles',
    RegisterStep.zone => 'Zone Wi-Fi',
    RegisterStep.security => 'Sécurité',
  };

  String get subtitle => switch (this) {
    RegisterStep.personal => 'Votre type de compte et vos coordonnées',
    RegisterStep.zone => 'Votre première zone et son emplacement',
    RegisterStep.security => 'Un mot de passe de 4 chiffres',
  };
}

/// Création de compte en trois étapes.
///
/// Un technicien n'a pas de zone à saisir : l'étape 2 est alors ignorée.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _zoneNameController = TextEditingController();
  final _zoneLocationController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordConfirmController = TextEditingController();

  AccountType _accountType = AccountType.wifiZoneOwner;
  RegisterStep _step = RegisterStep.personal;
  late PhoneCountryData _country = PhoneCountries.defaultCountry;

  /// Numéro vérifié de l'étape précédente, écrit au format international.
  ///
  /// Il est mis de côté à ce moment-là parce que les étapes suivantes peuvent
  /// revenir en arrière : revérifier à l'envoi risquerait de valider un pays
  /// différent de celui choisi, si l'utilisateur en avait changé entre-temps.
  String? _phone;

  bool _busy = false;

  String? _firstNameError;
  String? _lastNameError;
  String? _phoneError;
  String? _zoneNameError;
  String? _passwordError;
  String? _passwordConfirmError;

  bool get _isOwner => _accountType == AccountType.wifiZoneOwner;

  /// Étapes affichées : le technicien passe directement de 1 à 3.
  List<RegisterStep> get _steps => [
        RegisterStep.personal,
        if (_isOwner) RegisterStep.zone,
        RegisterStep.security,
      ];

  int get _stepIndex => _steps.indexOf(_step);

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _zoneNameController.dispose();
    _zoneLocationController.dispose();
    _passwordController.dispose();
    _passwordConfirmController.dispose();
    super.dispose();
  }

  void _reportError(String message, {String? field}) {
    if (!mounted) return;

    setState(() {
      switch (field) {
        case 'firstName':
          _firstNameError = message;
        case 'lastName':
          _lastNameError = message;
        case 'phone':
          _phoneError = message;
        case 'zoneName':
          _zoneNameError = message;
        case 'password':
          _passwordError = message;
        case 'passwordConfirm':
          _passwordConfirmError = message;
        default:
          break;
      }
    });

    showAppSnackBar(context, message, isError: true);
  }

  void _clearError(String field) {
    if (!mounted) return;

    setState(() {
      switch (field) {
        case 'firstName':
          _firstNameError = null;
        case 'lastName':
          _lastNameError = null;
        case 'phone':
          _phoneError = null;
        case 'zoneName':
          _zoneNameError = null;
        case 'password':
          _passwordError = null;
        case 'passwordConfirm':
          _passwordConfirmError = null;
      }
    });
  }

  void _selectAccountType(AccountType type) {
    setState(() {
      _accountType = type;
      // Le technicien n'a pas d'étape zone : on recalcule l'étape courante.
      if (!_steps.contains(_step)) {
        _step = RegisterStep.security;
      }
    });
  }

  /// Changer de pays change le plan de numérotation : le numéro déjà vérifié ne
  /// vaut plus rien, et le message affiché venait de l'ancien pays.
  void _selectCountry(PhoneCountryData country) {
    setState(() {
      _country = country;
      _phone = null;
      _phoneError = null;
    });
  }

  /// Rappel de la forme attendue sous le champ téléphone.
  ///
  /// Le numéro lui-même est vérifié au moment de passer à l'étape suivante, là
  /// où le pays choisi est encore à portée de regard.
  String _phoneHelper() =>
      '${_country.digitsLabel} · ex. ${_country.example}. '
      "Sert d'identifiant de connexion";

  /// Valide l'étape courante et passe à la suivante.
  void _next() {
    switch (_step) {
      case RegisterStep.personal:
        final firstName = _firstNameController.text.trim();
        final lastName = _lastNameController.text.trim();

        // Le numéro est vérifié ici, une fois pour toutes : c'est ici que le
        // pays est choisi, et l'utilisateur ne le verra plus ensuite.
        final validation = PhoneCountries.validate(
          _country,
          _phoneController.text.trim(),
        );

        if (lastName.isEmpty) {
          _reportError('Renseignez votre nom.', field: 'lastName');
          return;
        }
        if (firstName.isEmpty) {
          _reportError('Renseignez votre prénom.', field: 'firstName');
          return;
        }
        if (!validation.isAccepted) {
          _reportError(validation.message!, field: 'phone');
          return;
        }
        setState(() {
          _phone = validation.e164;
          _step = _steps[_stepIndex + 1];
        });
      case RegisterStep.zone:
        if (_zoneNameController.text.trim().isEmpty) {
          _reportError('Indiquez le nom de votre zone Wi-Fi.', field: 'zoneName');
          return;
        }
        setState(() => _step = _steps[_stepIndex + 1]);
      case RegisterStep.security:
        _submit();
    }
  }

  void _back() {
    if (_stepIndex == 0) {
      context.pop();
      return;
    }

    setState(() => _step = _steps[_stepIndex - 1]);
  }

  Future<void> _submit() async {
    final password = _passwordController.text.trim();
    final confirm = _passwordConfirmController.text.trim();

    if (_phone == null) {
      _reportError(
        "Revenez à l'étape précédente pour renseigner votre numéro.",
        field: 'phone',
      );
      return;
    }

    if (password.length != kPasswordLength) {
      _reportError(
        'Le mot de passe doit contenir $kPasswordLength chiffres.',
        field: 'password',
      );
      return;
    }
    if (password != confirm) {
      _reportError(
        'Les deux mots de passe ne correspondent pas.',
        field: 'passwordConfirm',
      );
      return;
    }

    setState(() => _busy = true);

    try {
      await ref.read(authControllerProvider.notifier).register(
            accountType: _accountType,
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
            phone: _phone!,
            password: password,
            zoneName: _isOwner ? _zoneNameController.text.trim() : null,
            zoneLocation: _isOwner ? _zoneLocationController.text.trim() : null,
          );
    } on ApiException catch (error) {
      _reportError(error.message);
    } catch (_) {
      _reportError('Création impossible. Réessayez.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final steps = _steps;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Créer un compte'),
        leading: IconButton(
          onPressed: _busy ? null : _back,
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: _stepIndex == 0 ? 'Retour à la connexion' : 'Étape précédente',
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.md,
                0,
              ),
              child: _StepIndicator(
                currentIndex: _stepIndex,
                total: steps.length,
                title: _step.title,
                subtitle: _step.subtitle,
              ),
            ),
            const Divider(height: AppSpacing.lg),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  0,
                  AppSpacing.md,
                  AppSpacing.xl,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: _stepFields(),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      // Barre d'action fixe : le bouton ne défile pas avec le formulaire.
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border(top: BorderSide(color: colors.outlineVariant)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(
              children: [
                Expanded(
                  child: AppButton(
                    label: 'Retour',
                    variant: AppButtonVariant.outline,
                    size: AppButtonSize.lg,
                    onPressed: _busy ? null : _back,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppButton(
                    label: _step == RegisterStep.security
                        ? 'Créer mon compte'
                        : 'Continuer',
                    loading: _busy,
                    size: AppButtonSize.lg,
                    onPressed: _busy ? null : _next,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _stepFields() {
    switch (_step) {
      case RegisterStep.personal:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AccountTypeSelector(
              value: _accountType,
              enabled: !_busy,
              onChanged: _selectAccountType,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppCard(
              variant: AppCardVariant.elevated,
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                children: [
                  AppInput(
                    controller: _lastNameController,
                    label: 'Nom',
                    hint: 'Kouassi',
                    required: true,
                    errorText: _lastNameError,
                    prefixIcon: Icons.badge_outlined,
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => _clearError('lastName'),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppInput(
                    controller: _firstNameController,
                    label: 'Prénom',
                    hint: 'Marc',
                    required: true,
                    errorText: _firstNameError,
                    prefixIcon: Icons.person_outline_rounded,
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => _clearError('firstName'),
                  ),
                  const SizedBox(height: AppSpacing.md),
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
                      onChanged: _selectCountry,
                    ),
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(_country.maxDigits),
                    ],
                    textInputAction: TextInputAction.done,
                    onChanged: (_) => setState(() => _phoneError = null),
                  ),
                ],
              ),
            ),
          ],
        );

      case RegisterStep.zone:
        return AppCard(
          variant: AppCardVariant.elevated,
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            children: [
              AppInput(
                controller: _zoneNameController,
                label: 'Nom de la zone Wi-Fi',
                hint: 'Zone Angré 8e Tranche',
                required: true,
                errorText: _zoneNameError,
                prefixIcon: Icons.wifi_tethering_rounded,
                textInputAction: TextInputAction.next,
                onChanged: (_) => _clearError('zoneName'),
              ),
              const SizedBox(height: AppSpacing.md),
              AppInput(
                controller: _zoneLocationController,
                label: 'Emplacement',
                hint: 'Cocody Angré, Abidjan',
                prefixIcon: Icons.location_on_outlined,
                textInputAction: TextInputAction.done,
              ),
            ],
          ),
        );

      case RegisterStep.security:
        return AppCard(
          variant: AppCardVariant.elevated,
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            children: [
              AppInput(
                controller: _passwordController,
                label: 'Mot de passe',
                hint: '$kPasswordLength chiffres',
                required: true,
                errorText: _passwordError,
                variant: AppInputVariant.password,
                prefixIcon: Icons.lock_outline_rounded,
                textInputAction: TextInputAction.next,
                onChanged: (_) => _clearError('password'),
              ),
              const SizedBox(height: AppSpacing.md),
              AppInput(
                controller: _passwordConfirmController,
                label: 'Confirmation du mot de passe',
                hint: '$kPasswordLength chiffres',
                required: true,
                errorText: _passwordConfirmError,
                variant: AppInputVariant.password,
                prefixIcon: Icons.lock_outline_rounded,
                textInputAction: TextInputAction.done,
                onChanged: (_) => _clearError('passwordConfirm'),
              ),
            ],
          ),
        );
    }
  }
}

/// Indicateur d'étapes : pastilles numérotées et libellé de l'étape courante.
class _StepIndicator extends StatelessWidget {
  const _StepIndicator({
    required this.currentIndex,
    required this.total,
    required this.title,
    required this.subtitle,
  });

  final int currentIndex;
  final int total;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (var index = 0; index < total; index++) ...[
              Expanded(
                child: Container(
                  height: 4,
                  decoration: BoxDecoration(
                    color: index <= currentIndex
                        ? colors.primary
                        : colors.outlineVariant,
                    borderRadius: BorderRadius.circular(AppRadius.full),
                  ),
                ),
              ),
              if (index < total - 1) const SizedBox(width: AppSpacing.xs),
            ],
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          'Étape ${currentIndex + 1} sur $total · $title',
          style: TextStyle(
            color: colors.primary,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          subtitle,
          style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
        ),
      ],
    );
  }
}