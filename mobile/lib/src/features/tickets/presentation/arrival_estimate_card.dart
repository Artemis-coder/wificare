import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/trip_map_card.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/states.dart';
import '../../zones/application/location_share.dart';
import '../application/ticket_providers.dart';

/// Intervalle de rafraîchissement pendant un trajet.
///
/// Assez court pour que l'heure bouge à l'œil, assez long pour ne pas vider de
/// la batterie à chaque point : le serveur bride lui-même ses notifications à
/// une toutes les deux minutes, ce cadrage évite juste de reconstruire l'écran
/// pour apprendre qu'il n'a rien de neuf.
const Duration _refreshInterval = Duration(seconds: 20);

/// Heure d'arrivée du technicien, et ce qu'il faut pour qu'elle existe.
///
/// Trois situations, et **aucune n'invente de chiffre** :
///
/// - le technicien partage et la destination est connue : ETA et distance ;
/// - le technicien partage mais le client n'a jamais donné sa position : le
///   serveur n'a nulle part où calculer l'arrivée, donc on le dit et on propose
///   le bouton qui règle le problème ;
/// - le technicien a arrêté : plus d'ETA à afficher, et l'ETA figée mentirait.
///   La carte se réduit à une demande de relance, seul le technicien pouvant y
///   répondre.
///
/// Une ETA fausse est pire que pas d'ETA : elle engage l'attente du client, et
/// il verrait le compteur arriver à zéro sans que personne soit à sa porte.
class ArrivalEstimateCard extends ConsumerStatefulWidget {
  const ArrivalEstimateCard({
    super.key,
    required this.ticketId,
    required this.zoneId,
    required this.tracking,
    required this.hasDestination,
  });

  final String ticketId;
  final String zoneId;
  final TicketTracking? tracking;

  /// La zone porte déjà des coordonnées relevées par le client.
  final bool hasDestination;

  @override
  ConsumerState<ArrivalEstimateCard> createState() => _ArrivalEstimateCardState();
}

class _ArrivalEstimateCardState extends ConsumerState<ArrivalEstimateCard> {
  Timer? _refresh;
  bool _nudging = false;

  @override
  void initState() {
    super.initState();

    // Le minuteur ne tourne que si le technicien est réellement en route : hors
    // de cette fenêtre, il n'y a rien à suivre et il ne doit rien coûter.
    if (widget.tracking?.active == true) {
      _refresh = Timer.periodic(_refreshInterval, (_) {
        ref.invalidate(ticketDetailProvider(widget.ticketId));
      });
    }
  }

  @override
  void dispose() {
    // Un minuteur laissé armé survivrait à l'écran et continuerait de sonder
    // le serveur pour une page que personne ne regarde.
    _refresh?.cancel();
    super.dispose();
  }

  Future<void> _shareLocation() async {
    final ok = await ref.read(locationShareProvider.notifier).share(widget.zoneId);

    if (!mounted) return;

    if (ok) {
      ref.invalidate(ticketDetailProvider(widget.ticketId));
      showAppSnackBar(context, 'Position enregistrée : votre heure d\'arrivée suit.');
      return;
    }

    showAppSnackBar(
      context,
      ref.read(locationShareProvider).error ?? 'Position non enregistrée.',
      isError: true,
    );
  }

  /// Demande au technicien de reprendre le partage de position.
  ///
  /// Le bouton disparaît dès l'envoi et ne revient qu'avec un suivi actif : le
  /// serveur répond toujours en succès, donc le laisser en place donnerait au
  /// client l'illusion d'avoir une nouvelle ETA alors qu'il n'y en a toujours
  /// aucune.
  Future<void> _nudgeTechnician() async {
    setState(() => _nudging = true);

    try {
      await ref.read(ticketRepositoryProvider).nudgeTracking(widget.ticketId);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _nudging = false);
      showAppSnackBar(context, e.message, isError: true);
      return;
    }

    if (!mounted) return;
    setState(() => _nudging = false);
    showAppSnackBar(context, 'Le technicien a été prévenu.');
  }

  @override
  Widget build(BuildContext context) {
    final tracking = widget.tracking;
    final share = ref.watch(locationShareProvider);
    final colors = context.colors;

    // Suivi arrêté : plus d'ETA à afficher, et une ETA figée serait un mensonge.
    // La carte disparaît donc — mais pas seule : le client peut demander au
    // technicien de reprendre, lui seul le peut. Sans ce bouton, un téléphone
    // qui a vidé sa batterie en chemin laissait le client sans rien.
    if (tracking != null && !tracking.active) {
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(title: 'Arrivée du technicien'),
            Text(
              'Le technicien ne partage plus sa position.',
              style: TextStyle(fontSize: 14, color: colors.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: _nudging ? 'Envoi en cours…' : 'Relancer le technicien',
              icon: Icons.notifications_active_rounded,
              loading: _nudging,
              onPressed: _nudging ? null : _nudgeTechnician,
            ),
          ],
        ),
      );
    }

    if (tracking == null || tracking.etaMinutes == null) {
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(title: 'Arrivée du technicien'),
            Text(
              widget.hasDestination
                  ? 'Le technicien n\'a pas encore partagé sa position.'
                  : 'Pour connaître l\'heure d\'arrivée, partagez la position de '
                      'votre zone : votre téléphone est dessus, et le technicien '
                      'sera vu à quelle distance il en est.',
              style: TextStyle(fontSize: 14, color: colors.onSurfaceVariant),
            ),
            if (share.error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                share.error!,
                style: TextStyle(fontSize: 13, color: colors.error),
              ),
            ],
            if (!widget.hasDestination) ...[
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: 'Partager ma position',
                icon: Icons.my_location_rounded,
                loading: share.busy,
                onPressed: _shareLocation,
              ),
            ],
          ],
        ),
      );
    }

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(title: 'Arrivée du technicien'),
          // La carte vient avant les chiffres : c'est l'image qui répond à « où
          // en est-il », et les chiffres la précèdent, ils l'expliquent.
          if (tracking.hasRoute) ...[
            TripMapCard(
              tracking: tracking,
              technicianName: tracking.technicianName ?? 'Le technicien',
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Icon(
                Icons.directions_car_filled_rounded,
                color: colors.primary,
              ),
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                child: Wrap(
                  spacing: AppSpacing.xs,
                  children: [
                    Text(
                      Fmt.eta(tracking.etaMinutes),
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: colors.primary,
                      ),
                    ),
                    Text(
                      'à ${Fmt.distance(tracking.distanceMeters)}',
                      style: TextStyle(fontSize: 15, color: colors.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${tracking.technicianName ?? 'Le technicien'} · position '
            '${Fmt.since(tracking.recordedAt)}',
            style: TextStyle(fontSize: 13, color: colors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}