import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers/infra_providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_input.dart';
import '../../../core/widgets/photo_picker_grid.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/auth_controller.dart';
import '../application/ticket_providers.dart';
import '../application/ticket_queries.dart';

/// Création d'une demande d'intervention par le client.
class TicketNewScreen extends ConsumerStatefulWidget {
  const TicketNewScreen({super.key});

  @override
  ConsumerState<TicketNewScreen> createState() => _TicketNewScreenState();
}

class _TicketNewScreenState extends ConsumerState<TicketNewScreen> {
  final _descriptionController = TextEditingController();

  String? _zoneId;
  TicketCategory? _category;
  Priority _priority = Priority.normal;
  final List<XFile> _photos = [];

  bool _busy = false;
  bool _uploading = false;
  String? _error;

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _addPhoto(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        imageQuality: 80,
        maxWidth: 1600,
      );
      if (picked != null) setState(() => _photos.add(picked));
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Impossible d\'accéder à la caméra ou à la galerie.');
      }
    }
  }

  Future<void> _submit() async {
    final zoneId = _zoneId;
    final category = _category;

    if (zoneId == null || category == null) {
      setState(() => _error = 'Choisissez une zone Wi-Fi et un type de demande.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final ticket = await ref.read(ticketRepositoryProvider).create(
        wifiZoneId: zoneId,
        type: category.label,
        priority: _priority,
        description: _descriptionController.text.trim(),
      );

      if (_photos.isNotEmpty) {
        setState(() => _uploading = true);
        try {
          final form = FormData.fromMap({
            'files': [
              for (final photo in _photos)
                await MultipartFile.fromFile(photo.path, filename: photo.name),
            ],
          });
          await ref.read(apiClientProvider).post('/tickets/${ticket.id}/files', data: form);
        } catch (_) {
          // La demande est créée : on n'annule pas pour un échec d'envoi photo.
          if (mounted) {
            showAppSnackBar(
              context,
              'Demande créée, mais les photos n\'ont pas pu être envoyées.',
              isError: true,
            );
          }
        } finally {
          if (mounted) setState(() => _uploading = false);
        }
      }

      // La liste est relue avant de revenir à l'écran précédent. Sans cela, le
      // client restait devant une liste sans sa nouvelle panne, et ses compteurs
      // du tableau de bord non plus : il aurait fallu tirer pour actualiser.
      //
      // L'invalidation porte sur toute la famille, pas sur l'instance du filtre
      // affiché. Un `FutureProvider.autoDispose.family` garde une instance par
      // filtre, et le client peut revenir sur l'un d'eux depuis un onglet resté
      // monté : invalider le seul filtre courant laisserait les autres montrer
      // une liste antérieure à la création.
      ref.invalidate(ticketListProvider);

      if (!mounted) return;
      showAppSnackBar(context, 'Demande ${ticket.reference} créée');
      context.pop();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Création impossible. Réessayez.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final zones = ref.watch(clientAccountProvider)?.zones ?? const <WifiZone>[];

    return Scaffold(
      appBar: AppBar(title: const Text('Nouvelle demande')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          AppSpacing.xxl,
        ),
        children: [
          if (_error != null) ...[
            ErrorBanner(message: _error!),
            const SizedBox(height: AppSpacing.md),
          ],

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeader(title: 'Zone Wi-Fi concernée'),
                if (zones.isEmpty)
                  const EmptyState(
                    icon: Icons.wifi_tethering_error_rounded,
                    title: 'Aucune zone enregistrée',
                    message: 'Contactez le service commercial pour enregistrer votre zone.',
                  )
                else if (!zones.any((zone) => zone.isActive))
                  const EmptyState(
                    icon: Icons.hourglass_top_rounded,
                    title: 'Zone en attente de validation',
                    message:
                        "Vos zones sont déclarées mais pas encore validées par la plateforme. Vous pourrez signaler une panne dès qu'elles seront validées.",
                  )
                else
                  // Seules les zones validées sont proposées : le serveur
                  // refuse toute demande sur une zone en attente, mieux vaut ne
                  // pas laisser choisir puis échouer.
                  for (final zone in zones.where((zone) => zone.isActive))
                    _SelectionRow(
                      selected: _zoneId == zone.id,
                      title: zone.name,
                      subtitle: zone.location,
                      onTap: () => setState(() => _zoneId = zone.id),
                    ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeader(title: 'Type de demande'),
                const SizedBox(height: AppSpacing.sm),
                for (final category in TicketCategory.values)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: _CategoryOption(
                      category: category,
                      selected: _category == category,
                      onTap: () => setState(() => _category = category),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeader(title: 'Priorité'),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final priority in Priority.values)
                      _PriorityChip(
                        priority: priority,
                        selected: _priority == priority,
                        onTap: () => setState(() => _priority = priority),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          AppCard(
            child: AppInput(
              controller: _descriptionController,
              label: 'Description',
              hint: 'Décrivez le problème rencontré',
              variant: AppInputVariant.multiline,
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          AppCard(
            child: PhotoPickerGrid(
              photos: _photos,
              busy: _uploading,
              onAdd: _addPhoto,
              onRemove: (index) => setState(() => _photos.removeAt(index)),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          AppButton(
            label: 'Envoyer la demande',
            icon: Icons.send_rounded,
            size: AppButtonSize.lg,
            loading: _busy,
            onPressed: zones.isEmpty ? null : _submit,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Un technicien sera affecté à votre demande dans les meilleurs délais.',
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _SelectionRow extends StatelessWidget {
  const _SelectionRow({
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
              color: selected ? colors.primary : colors.onSurfaceVariant,
              size: 20,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: colors.onSurface,
                      fontSize: 14,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryOption extends StatelessWidget {
  const _CategoryOption({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final TicketCategory category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: selected
              ? colors.primary.withValues(alpha: 0.08)
              : colors.surface,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(
            color: selected ? colors.primary : colors.outlineVariant,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: selected ? colors.primary : colors.surfaceVariant,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Icon(
                category.icon,
                size: 20,
                color: selected ? colors.onPrimary : colors.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    category.label,
                    style: TextStyle(
                      color: colors.onSurface,
                      fontSize: 14,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    category.description,
                    style: TextStyle(
                      color: colors.onSurfaceVariant,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_off_rounded,
              color: selected ? colors.primary : colors.onSurfaceVariant,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _PriorityChip extends StatelessWidget {
  const _PriorityChip({
    required this.priority,
    required this.selected,
    required this.onTap,
  });

  final Priority priority;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.full),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: selected ? priority.color.withValues(alpha: 0.12) : colors.surface,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(
            color: selected ? priority.color : colors.outlineVariant,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: priority.color, shape: BoxShape.circle),
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              priority.label,
              style: TextStyle(
                color: selected ? priority.color : colors.onSurface,
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
