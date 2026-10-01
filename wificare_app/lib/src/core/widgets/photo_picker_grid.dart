import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Galerie de photos sélectionnées (caméra + galerie) avant envoi au serveur.
///
/// Remplace le `expo-image-picker` de l'app React Native. Les fichiers ne sont
/// envoyés que lors de la soumission du formulaire.
class PhotoPickerGrid extends StatelessWidget {
  const PhotoPickerGrid({
    super.key,
    required this.photos,
    required this.onAdd,
    required this.onRemove,
    this.label = 'Photos',
    this.emptyHint = 'Ajoutez des photos pour illustrer la demande',
    this.busy = false,
  });

  final List<XFile> photos;
  final Future<void> Function(ImageSource source) onAdd;
  final ValueChanged<int> onRemove;
  final String label;
  final String emptyHint;
  final bool busy;

  Future<void> _pick(BuildContext context) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpacing.sm),
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded),
              title: const Text('Prendre une photo'),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded),
              title: const Text('Choisir dans la galerie'),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.gallery),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );

    if (source != null) await onAdd(source);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            if (photos.isNotEmpty)
              Text(
                '${photos.length} photo${photos.length > 1 ? 's' : ''}',
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            GestureDetector(
              onTap: busy ? null : () => _pick(context),
              child: Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(color: colors.primary.withValues(alpha: 0.5)),
                ),
                child: busy
                    ? const Center(
                        child: SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add_a_photo_rounded, color: colors.primary, size: 22),
                          const SizedBox(height: 4),
                          Text(
                            'Ajouter',
                            style: TextStyle(
                              color: colors.primary,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
            for (var i = 0; i < photos.length; i++)
              Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    child: Image.file(
                      File(photos[i].path),
                      width: 84,
                      height: 84,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    top: 2,
                    right: 2,
                    child: GestureDetector(
                      onTap: () => onRemove(i),
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: colors.scrim,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.close_rounded,
                          size: 14,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
        if (photos.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text(
              emptyHint,
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
