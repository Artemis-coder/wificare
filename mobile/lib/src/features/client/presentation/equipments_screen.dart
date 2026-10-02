import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_input.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../../zones/application/zone_providers.dart';

/// Types d'équipement acceptés par l'API (`createEquipment` transmet la valeur
/// brute telle quelle).
const List<String> kEquipmentTypes = ['ROUTER', 'SWITCH', 'ONT', 'ONDER'];

IconData equipmentIcon(String type) => switch (type.toUpperCase()) {
  'ROUTER' || 'RTR' => Icons.router,
  'SWITCH' => Icons.switch_account,
  'ONT' => Icons.lan,
  _ => Icons.devices_other,
};

String equipmentTypeLabel(String type) {
  final raw = type.trim();
  if (raw.isEmpty) return 'Équipement';
  final lower = raw.toLowerCase();
  return '${lower[0].toUpperCase()}${lower.substring(1)}';
}

/// Équipements du client connecté, groupés par zone Wi-Fi.
class EquipmentsScreen extends ConsumerStatefulWidget {
  const EquipmentsScreen({super.key});

  @override
  ConsumerState<EquipmentsScreen> createState() => _EquipmentsScreenState();
}

class _EquipmentsScreenState extends ConsumerState<EquipmentsScreen> {
  String? _selectedZoneId;

  WifiZone? _zoneFor(List<WifiZone> zones) {
    if (zones.isEmpty) return null;
    return zones.firstWhere(
      (z) => z.id == _selectedZoneId,
      orElse: () => zones.first,
    );
  }

  Future<void> _refresh() async {
    await ref.read(authControllerProvider.notifier).refreshProfile();
  }

  Future<void> _openCreateSheet(WifiZone zone) async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EquipmentFormSheet(wifiZoneId: zone.id),
    );
    if (created != true || !mounted) return;
    await ref.read(authControllerProvider.notifier).refreshProfile();
    if (!mounted) return;
    showAppSnackBar(context, 'Équipement ajouté');
  }

  Future<void> _openCreateZoneSheet() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _ZoneFormSheet(),
    );
    if (created != true || !mounted) return;
    await ref.read(authControllerProvider.notifier).refreshProfile();
    if (!mounted) return;
    showAppSnackBar(
      context,
      'Zone déclarée. Elle sera utilisable une fois validée par la plateforme.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final zones = ref.watch(clientAccountProvider)?.zones ?? const <WifiZone>[];
    final zone = _zoneFor(zones);
    final equipments = zone?.equipments ?? const <Equipment>[];

    return Scaffold(
      appBar: AppBar(title: const Text('Mes équipements')),
      floatingActionButton: zone == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openCreateSheet(zone),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Nouvel équipement'),
            ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: zones.isEmpty
              ? ListView(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  children: [
                    const SizedBox(height: AppSpacing.xl),
                    const EmptyState(
                      title: 'Aucune zone Wi-Fi',
                      message:
                          "Ajoutez votre première zone pour signaler une panne ou déclarer vos équipements.",
                      icon: Icons.router_rounded,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Center(
                      child: AppButton(
                        label: 'Ajouter une zone',
                        icon: Icons.add_rounded,
                        onPressed: _openCreateZoneSheet,
                      ),
                    ),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.md,
                    AppSpacing.sm,
                    AppSpacing.md,
                    96,
                  ),
                  children: [
                    SectionHeader(
                      title: 'Zone',
                      trailing: TextButton.icon(
                        onPressed: _openCreateZoneSheet,
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: const Text('Ajouter une zone'),
                      ),
                    ),
                    SizedBox(
                      height: 44,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: zones.length,
                        separatorBuilder: (_, _) =>
                            const SizedBox(width: AppSpacing.sm),
                        itemBuilder: (context, index) {
                          final item = zones[index];
                          return ChoiceChip(
                            label: Text(item.name),
                            selected: item.id == zone?.id,
                            showCheckmark: false,
                            selectedColor: colors.primary,
                            labelStyle: TextStyle(
                              color: item.id == zone?.id
                                  ? colors.onPrimary
                                  : colors.onSurface,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                            side: BorderSide(
                              color: item.id == zone?.id
                                  ? colors.primary
                                  : colors.outlineVariant,
                            ),
                            onSelected: (_) =>
                                setState(() => _selectedZoneId = item.id),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    if (zone != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                        child: Text(
                          '${equipments.length} équipement${equipments.length > 1 ? 's' : ''}',
                          style: TextStyle(
                            color: colors.onSurfaceVariant,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    if (zone != null && zone.location.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: Row(
                          children: [
                            Icon(
                              Icons.location_on_outlined,
                              size: 16,
                              color: colors.onSurfaceVariant,
                            ),
                            const SizedBox(width: AppSpacing.xs),
                            Expanded(
                              child: Text(
                                zone.location,
                                style: TextStyle(
                                  color: colors.onSurfaceVariant,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (zone != null && !zone.isActive)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: _ZonePendingNotice(zone: zone),
                      ),
                    if (equipments.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.xl),
                        child: EmptyState(
                          title: 'Aucun équipement',
                          message:
                              'Ajoutez le routeur, le switch ou l\'ONT installé dans cette zone.',
                          icon: Icons.devices_other_rounded,
                        ),
                      )
                    else
                      for (final equipment in equipments)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                          child: EquipmentCard(equipment: equipment),
                        ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Bandeausignalant qu'une zone attend encore la validation de la plateforme.
///
/// Le propriétaire peut tout de suite déclarer ses équipements : seule la
/// demande d'intervention est bloquée tant que la zone n'est pas validée.
class _ZonePendingNotice extends StatelessWidget {
  const _ZonePendingNotice({required this.zone});

  final WifiZone zone;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.hourglass_top_rounded,
            size: 20,
            color: zone.status.color,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  zone.status.label,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  'Vous pouvez déclarer vos équipements. Les demandes '
                  "d'intervention seront possibles dès que la plateforme aura "
                  'validé cette zone.',
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Carte d'un équipement : type, marque/modèle, numéro de série.
class EquipmentCard extends StatelessWidget {
  const EquipmentCard({super.key, required this.equipment});

  final Equipment equipment;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final icon = equipmentIcon(equipment.type);
    final serial = equipment.serialNumber;
    final label = equipment.label;

    return AppCard(
      child: Row(
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
                  equipmentTypeLabel(equipment.type),
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (label.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    label,
                    style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
                  ),
                ],
                if (serial != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      Icon(
                        Icons.qr_code_rounded,
                        size: 14,
                        color: colors.onSurfaceVariant,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Expanded(
                        child: Text(
                          serial,
                          style: TextStyle(
                            color: colors.onSurfaceVariant,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Formulaire d'ajout d'une zone Wi-Fi, présenté en bottom sheet.
class _ZoneFormSheet extends ConsumerStatefulWidget {
  const _ZoneFormSheet();

  @override
  ConsumerState<_ZoneFormSheet> createState() => _ZoneFormSheetState();
}

class _ZoneFormSheetState extends ConsumerState<_ZoneFormSheet> {
  final _nameController = TextEditingController();
  final _locationController = TextEditingController();

  String? _nameError;
  bool _busy = false;

  @override
  void dispose() {
    _nameController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();

    setState(() => _nameError = name.isEmpty ? 'Le nom est obligatoire.' : null);
    if (_nameError != null) return;

    setState(() => _busy = true);

    try {
      await ref.read(zoneRepositoryProvider).createZone(
            name: name,
            location: _locationController.text.trim(),
          );

      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, 'Ajout impossible. Réessayez.', isError: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.outlineVariant,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Nouvelle zone Wi-Fi',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              "Elle sera rattachée à votre dossier et selectable pour vos demandes.",
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppInput(
              controller: _nameController,
              label: 'Nom de la zone',
              hint: 'Zone Angré 8e Tranche',
              required: true,
              errorText: _nameError,
              prefixIcon: Icons.wifi_tethering_rounded,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: AppSpacing.md),
            AppInput(
              controller: _locationController,
              label: 'Emplacement',
              hint: 'Cocody Angré, Abidjan',
              prefixIcon: Icons.location_on_outlined,
              textInputAction: TextInputAction.done,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: 'Ajouter la zone',
              loading: _busy,
              size: AppButtonSize.lg,
              onPressed: _busy ? null : _submit,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );
  }
}

/// Formulaire de création, présenté en bottom sheet.
class _EquipmentFormSheet extends ConsumerStatefulWidget {
  const _EquipmentFormSheet({required this.wifiZoneId});

  final String wifiZoneId;

  @override
  ConsumerState<_EquipmentFormSheet> createState() =>
      _EquipmentFormSheetState();
}

class _EquipmentFormSheetState extends ConsumerState<_EquipmentFormSheet> {
  final _brandController = TextEditingController();
  final _modelController = TextEditingController();
  final _serialController = TextEditingController();

  String _type = kEquipmentTypes.first;
  String? _brandError;
  String? _modelError;
  bool _busy = false;

  @override
  void dispose() {
    _brandController.dispose();
    _modelController.dispose();
    _serialController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final brand = _brandController.text.trim();
    final model = _modelController.text.trim();

    setState(() {
      _brandError = brand.isEmpty ? 'La marque est obligatoire.' : null;
      _modelError = model.isEmpty ? 'Le modèle est obligatoire.' : null;
    });
    if (_brandError != null || _modelError != null) return;

    setState(() => _busy = true);

    try {
      await ref
          .read(zoneRepositoryProvider)
          .createEquipment(
            widget.wifiZoneId,
            type: _type,
            brand: brand,
            model: model,
            serialNumber: _serialController.text.trim(),
          );

      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, 'Ajout impossible. Réessayez.', isError: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.outlineVariant,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text('Nouvel équipement', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.lg),
            Text(
              "Type d'équipement",
              style: TextStyle(
                color: colors.onSurface,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final type in kEquipmentTypes)
                  ChoiceChip(
                    avatar: Icon(
                      equipmentIcon(type),
                      size: 18,
                      color: type == _type ? colors.onPrimary : colors.onSurfaceVariant,
                    ),
                    label: Text(equipmentTypeLabel(type)),
                    selected: type == _type,
                    showCheckmark: false,
                    selectedColor: colors.primary,
                    labelStyle: TextStyle(
                      color: type == _type ? colors.onPrimary : colors.onSurface,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                    side: BorderSide(
                      color: type == _type ? colors.primary : colors.outlineVariant,
                    ),
                    onSelected: (_) => setState(() => _type = type),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            AppInput(
              controller: _brandController,
              label: 'Marque',
              hint: 'Ex. Huawei',
              required: true,
              errorText: _brandError,
              prefixIcon: Icons.business_outlined,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: AppSpacing.md),
            AppInput(
              controller: _modelController,
              label: 'Modèle',
              hint: 'Ex. HG8245H',
              required: true,
              errorText: _modelError,
              prefixIcon: Icons.inventory_2_outlined,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: AppSpacing.md),
            AppInput(
              controller: _serialController,
              label: 'Numéro de série',
              hint: 'Optionnel',
              prefixIcon: Icons.qr_code_rounded,
              textInputAction: TextInputAction.done,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: 'Enregistrer',
              loading: _busy,
              size: AppButtonSize.lg,
              onPressed: _busy ? null : _submit,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: 'Annuler',
              variant: AppButtonVariant.ghost,
              onPressed: _busy ? null : () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
