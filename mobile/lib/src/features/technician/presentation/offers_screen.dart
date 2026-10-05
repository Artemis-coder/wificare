import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/env.dart';
import '../../../core/domain/models.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../application/availability_controller.dart';

/// Demandes proposées au technicien, en attente qu'il en prenne une.
///
/// L'écran ne montre pas des demandes qui lui appartiennent : il montre ce que
/// le circuit lui propose. Le premier à accepter l'emporte, et la demande sort
/// aussitôt des écrans des autres — ce qui explique pourquoi une carte peut
/// disparaître d'un coup, et pourquoi refuser n'a pas le même effet que prendre.
class OffersScreen extends ConsumerStatefulWidget {
  const OffersScreen({super.key, this.initialOfferId});

  /// Proposition à ouvrir dès l'affichage, nommée par l'adresse.
  ///
  /// C'est le chemin emprunté par une notification push : l'application ouvre
  /// l'écran avec l'identifiant de la proposition, et la feuille s'ouvre dès
  /// que la file contient cette proposition. Passer par l'adresse plutôt que par
  /// une variable en mémoire laisse le lien partageable et rend le retour
  /// arrière correct — quitter l'écran ne doit pas laisser une feuille ouverte.
  final String? initialOfferId;

  @override
  ConsumerState<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends ConsumerState<OffersScreen> {
  /// Une proposition nommée par le push n'est ouverte qu'une fois : la boucle de
  /// répartition rafraîchit la file toutes les cinq secondes, et la feuille
  /// reviendrait s'ouvrir à chaque passage.
  bool _openedFocusedOffer = false;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(availabilityProvider);
    final controller = ref.read(availabilityProvider.notifier);

    _maybeOpenFocusedOffer(state);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Demandes disponibles'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.md),
            child: Center(child: AvailabilityPill(state: state)),
          ),
        ],
      ),
      body: Column(
        children: [
          if (state.message != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                0,
              ),
              child: ErrorBanner(message: state.message!),
            ),
          // Hors ligne, cette liste ne se remplira pas. Le dire est ce qui
          // distingue « personne n'a signalé de panne » de « tu n'es pas
          // candidat ».
          if (!state.isOnline)
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                0,
              ),
              child: ErrorBanner(
                message:
                    'Vous êtes hors ligne : aucune demande ne vous est proposée. '
                    'Mettez-vous en ligne depuis l’accueil.',
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: controller.refresh,
              child: _list(context, state),
            ),
          ),
        ],
      ),
    );
  }

  Widget _list(BuildContext context, AvailabilityState state) {
    if (state.offers.isEmpty) {
      return ListView(
        children: [
          SizedBox(
            height: 360,
            child: EmptyState(
              icon: Icons.inbox_rounded,
              title: state.isOnline
                  ? 'Aucune demande pour le moment'
                  : 'Vous êtes hors ligne',
              message: state.isOnline
                  ? 'Les demandes qui arrivent vous seront notifiées, ici et sur votre téléphone.'
                  : 'Mettez-vous en ligne pour recevoir les demandes qui se présentent.',
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.xxl,
      ),
      itemCount: state.offers.length,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (context, index) {
        final offer = state.offers[index];

        return OfferCard(
          offer: offer,
          onOpen: () => _openOffer(context, offer),
        );
      },
    );
  }

  void _maybeOpenFocusedOffer(AvailabilityState state) {
    final offerId = widget.initialOfferId;

    if (offerId == null || _openedFocusedOffer) return;
    // Tant que la première lecture n'est pas revenue, la file est peut-être
    // juste vide : on ne conclut rien avant de l'avoir lue.
    if (state.presence == null) return;

    _openedFocusedOffer = true;

    for (final offer in state.offers) {
      if (offer.id == offerId) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _openOffer(context, offer);
        });
        return;
      }
    }
  }

  /// Ouvre le détail d'une demande, puis suit ce que le technicien en fait.
  ///
  /// La navigation se fait ici et non dans la feuille : une feuille refermée n'a
  /// plus de contexte de navigation, et une demande prise doit ouvrir son écran
  /// d'intervention dans l'espace du technicien — pas dans celui de la feuille
  /// qui l'a posée.
  Future<void> _openOffer(BuildContext context, TaskOffer offer) async {
    final ticket = await showOfferSheet(context, offer);

    if (ticket == null || !context.mounted) return;

    context.push('${TechnicianRoutes.tickets}/${ticket.id}');
  }
}

/// Pastille d'état de la disponibilité, dans la barre de l'écran.
///
/// Elle rappelle où en est la répartition pendant que le technicien regarde ses
/// offres : hors ligne, il ne peut rien attendre de cette liste.
class AvailabilityPill extends StatelessWidget {
  const AvailabilityPill({super.key, required this.state});

  final AvailabilityState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    final label = !state.isOnline
        ? 'Hors ligne'
        : state.isUnreachable
            ? 'Injoignable'
            : 'En ligne';

    return AppBadge(
      label: label,
      dot: true,
      color: !state.isOnline
          ? colors.onSurfaceVariant
          : state.isUnreachable
              ? colors.warning
              : colors.success,
    );
  }
}

/// Carte d'une demande proposée, avec ce qu'il faut pour décider.
class OfferCard extends StatelessWidget {
  const OfferCard({super.key, required this.offer, required this.onOpen});

  final TaskOffer offer;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return AppCard(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  offer.reference,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              StatusBadge.priority(offer.priority),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            offer.type,
            style: TextStyle(
              color: colors.onSurface,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${offer.clientName} · ${offer.zoneName}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
          ),
          if (offer.description != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              offer.description!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Icon(
                Icons.schedule_rounded,
                size: 14,
                color: colors.onSurfaceVariant,
              ),
              const SizedBox(width: AppSpacing.xs),
              Text(
                Fmt.relativeDay(offer.createdAt),
                style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
              ),
              if (offer.photos.isNotEmpty) ...[
                const SizedBox(width: AppSpacing.md),
                Icon(
                  Icons.photo_library_outlined,
                  size: 14,
                  color: colors.onSurfaceVariant,
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  '${offer.photos.length}',
                  style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
                ),
              ],
              const Spacer(),
              Text(
                'Voir le détail',
                style: TextStyle(
                  color: colors.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.primary, size: 18),
            ],
          ),
        ],
      ),
    );
  }
}

/// Ouvre le détail d'une demande proposée et rend la demande prise.
///
/// Prendre la demande la rend au technicien et ferme la feuille ; la navigation
/// vers son écran d'intervention incombe à l'appelant, une feuille refermée
/// n'ayant plus de contexte de navigation. `null` signifie « pas prise » — la
/// feuille reste ouverte et le motif du refus est affiché sur l'écran derrière.
Future<Ticket?> showOfferSheet(BuildContext context, TaskOffer offer) {
  return showModalBottomSheet<Ticket>(
    context: context,
    isScrollControlled: true,
    builder: (context) => _OfferSheet(offer: offer),
  );
}

class _OfferSheet extends ConsumerStatefulWidget {
  const _OfferSheet({required this.offer});

  final TaskOffer offer;

  @override
  ConsumerState<_OfferSheet> createState() => _OfferSheetState();
}

class _OfferSheetState extends ConsumerState<_OfferSheet> {
  bool _busy = false;

  Future<void> _accept() async {
    if (_busy) return;

    final navigator = Navigator.of(context);
    setState(() => _busy = true);

    final ticket = await ref
        .read(availabilityProvider.notifier)
        .accept(widget.offer);

    if (!mounted) return;
    setState(() => _busy = false);

    // Si le serveur a refusé — un autre technicien a gagné — la feuille reste
    // ouverte : le motif est dans l'état, affiché en bannière sur l'écran des
    // offres juste derrière elle.
    if (ticket != null) navigator.pop(ticket);
  }

  Future<void> _decline() async {
    if (_busy) return;

    final navigator = Navigator.of(context);
    final confirmed = await confirmDialog(
      context,
      title: 'Refuser cette demande ?',
      message:
          'Elle sera proposée aux autres techniciens en ligne. Vous ne la '
          'verrez plus.',
      confirmLabel: 'Refuser',
      cancelLabel: 'Garder',
      destructive: true,
    );

    if (!confirmed || !mounted) return;

    setState(() => _busy = true);

    await ref.read(availabilityProvider.notifier).decline(widget.offer);

    if (!mounted) return;
    navigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final offer = widget.offer;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: AppSpacing.md,
          right: AppSpacing.md,
          top: AppSpacing.md,
          bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.md,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      offer.reference,
                      style: TextStyle(
                        color: colors.onSurface,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  StatusBadge.priority(offer.priority),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                offer.type,
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              InfoRow(
                label: 'Client',
                value: offer.clientName,
                icon: Icons.person_outline_rounded,
              ),
              InfoRow(
                label: 'Contact',
                value: offer.clientContact.isEmpty
                    ? 'Non renseigné'
                    : offer.clientContact,
                icon: Icons.call_outlined,
              ),
              InfoRow(
                label: 'Zone',
                value: offer.zoneName,
                icon: Icons.router_outlined,
              ),
              if (offer.zoneLocation.isNotEmpty)
                InfoRow(
                  label: 'Emplacement',
                  value: offer.zoneLocation,
                  icon: Icons.place_outlined,
                ),
              InfoRow(
                label: 'Signalée',
                value: Fmt.dateTime(offer.createdAt),
                icon: Icons.schedule_rounded,
              ),
              if (offer.description != null) ...[
                const SizedBox(height: AppSpacing.md),
                const SectionHeader(title: 'Ce que dit le client'),
                Text(
                  offer.description!,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
              ],
              if (offer.photos.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                SectionHeader(
                  title: 'Photos jointes',
                  subtitle: '${offer.photos.length} pièce(s)',
                ),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final photo in offer.photos) _OfferPhoto(url: photo.url),
                  ],
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: 'Prendre cette demande',
                icon: Icons.check_rounded,
                loading: _busy,
                onPressed: _accept,
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: 'Refuser cette demande',
                variant: AppButtonVariant.outline,
                loading: _busy,
                onPressed: _decline,
              ),
              const SizedBox(height: AppSpacing.sm),
              // Le circuit est expliqué ici plutôt que dans un écran d'aide : la
              // règle qui décide de l'ordre des demandes et de ce qu'il advient
              // à un refus est celle qui manque précisément quand on hésite.
              Text(
                'En prenant la demande, elle vous est attribuée et les autres '
                'techniciens ne la verront plus. En la refusant, elle repart '
                'chez ceux qui sont en ligne.',
                style: TextStyle(
                  color: colors.onSurfaceVariant,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfferPhoto extends StatelessWidget {
  const _OfferPhoto({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    // Une URL déjà absolue est renvoyée telle quelle : la préfixer de nouveau
    // produirait une adresse commençant par `http` qui ne charge rien.
    final absolute = url.startsWith('http')
        ? url
        : '${AppConfig.apiBaseUrl}$url';

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Image.network(
        absolute,
        width: 88,
        height: 88,
        fit: BoxFit.cover,
        // Une photo qui ne se charge pas ne doit pas laisser un trou au milieu
        // de la décision : le cadre reste, et la pièce est signalée sans être
        // montrée.
        errorBuilder: (context, error, stack) => Container(
          width: 88,
          height: 88,
          color: context.colors.surfaceVariant,
          child: Icon(
            Icons.broken_image_outlined,
            color: context.colors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}