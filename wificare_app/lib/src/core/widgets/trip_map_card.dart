import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../domain/models.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../utils/formatters.dart';

/// Carte du trajet en cours, et heure d'arrivée.
///
/// Elle répond à la seule question qui compte pendant une panne : *combien de
/// temps, et dans quelle direction*. Le point A est le technicien, le point B la
/// zone du client ; l'ETA affichée en dessous est celle que le serveur a
/// calculée, jamais recalculée ici — une carte qui donnerait un chiffre différent
/// de l'estimation officielle rendrait les deux.False.
///
/// Rien n'est dessiné tant que les deux points ne sont pas connus : voir
/// [TicketTracking.hasRoute].
class TripMapCard extends StatelessWidget {
  const TripMapCard({
    super.key,
    required this.tracking,
    required this.technicianName,
  });

  final TicketTracking tracking;

  /// Nom affiché sur le marqueur du technicien.
  final String technicianName;

  @override
  Widget build(BuildContext context) {
    if (!tracking.hasRoute) return const SizedBox.shrink();

    final from = LatLng(tracking.latitude!, tracking.longitude!);
    final to = LatLng(
      tracking.destinationLatitude!,
      tracking.destinationLongitude!,
    );

    // Pas de carte autour : ce composant s'insère dans une section qui en est
    // déjà une. Un second cadre ne ferait qu'épaissir la bordure.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: _Map(from: from, to: to),
        ),
        _ArrivalFooter(tracking: tracking, technicianName: technicianName),
      ],
    );
  }
}

class _Map extends StatelessWidget {
  const _Map({required this.from, required this.to});

  final LatLng from;
  final LatLng to;

  /// OpenStreetMap : tuiles publiques, sans clé ni compte.
  ///
  /// L'attribution est affichée par `RichAttributionWidget` : la licence
  /// OpenStreetMap l'exige, et c'est aussi la seule chose qui distingue une
  /// carte d'un fond vide quand le réseau manque.
  TileLayer get _tiles => TileLayer(
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    userAgentPackageName: 'com.wificare.mobile',
    maxZoom: 19,
  );

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return SizedBox(
      height: 220,
      child: FlutterMap(
        options: MapOptions(
          initialCenter: from,
          // Cadrage large des deux points : un marqueur hors champ ferait croire
          // que le technicien est arrivé, alors qu'il est encore en chemin.
          initialCameraFit: CameraFit.bounds(
            bounds: LatLngBounds.fromPoints([from, to]),
            padding: const EdgeInsets.all(56),
          ),
          interactionOptions: const InteractionOptions(
            // La carte reste consultable, mais le geste ne fait pas défiler la
            // page derrière elle.
            flags: InteractiveFlag.drag |
                InteractiveFlag.pinchZoom |
                InteractiveFlag.doubleTapZoom,
          ),
          onTap: (_, _) {},
        ),
        children: [
          _tiles,
          PolylineLayer(
            polylines: [
              // Le segment direct entre A et B : ce n'est pas un itinéraire
              // routé, il montre la direction générale, et l'ETA affichée en
              // dessous reste la seule estimation officielle.
              Polyline(
                points: [from, to],
                color: colors.primary.withValues(alpha: 0.65),
                strokeWidth: 4,
                pattern: StrokePattern.dashed(
                  segments: const [14, 10],
                ),
              ),
            ],
          ),
          MarkerLayer(
            markers: [
              // Point A : le technicien, à l'origine du trajet.
              Marker(
                point: from,
                width: 40,
                height: 40,
                child: const _Pin(icon: Icons.directions_car_filled_rounded),
              ),
              // Point B : la zone du client, l'arrivée.
              Marker(
                point: to,
                width: 40,
                height: 40,
                child: const _Pin(icon: Icons.home_rounded),
              ),
            ],
          ),
          RichAttributionWidget(
            attributions: const [TextSourceAttribution('OpenStreetMap')],
          ),
        ],
      ),
    );
  }
}

/// Marqueur de carte.
///
/// Rendu en Material ordinary plutôt qu'en `defaultMarker` : celui-ci ignore
/// les couleurs de l'application, et un point B vert sur fond de tuiles grises
/// se perd.
class _Pin extends StatelessWidget {
  const _Pin({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.primary,
        shape: BoxShape.circle,
        border: Border.all(color: colors.surface, width: 3),
        boxShadow: const [
          BoxShadow(color: Color(0x33000000), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Icon(icon, color: colors.onPrimary, size: 20),
    );
  }
}

/// Arrivée estimée, sous la carte.
class _ArrivalFooter extends StatelessWidget {
  const _ArrivalFooter({required this.tracking, required this.technicianName});

  final TicketTracking tracking;
  final String technicianName;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final eta = tracking.etaMinutes;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Pas d'ETA sans destination connue : afficher « — » à la place du
          // chiffre laisserait croire à un calcul en cours.
          if (eta == null)
            Text(
              'Arrivée estimée indisponible : votre zone n\'a pas encore de '
              'position partagée.',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 13),
            )
          else
            Row(
              children: [
                Icon(Icons.directions_car_filled_rounded, color: colors.primary),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Wrap(
                    spacing: AppSpacing.xs,
                    children: [
                      Text(
                        Fmt.eta(eta),
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: colors.primary,
                        ),
                      ),
                      if (tracking.distanceMeters != null)
                        Text(
                          'à ${Fmt.distance(tracking.distanceMeters!)}',
                          style: TextStyle(
                            fontSize: 15,
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          const SizedBox(height: AppSpacing.xs),
          // Un trajet déjà terminé n'est plus une arrivée à attendre : le
          // compteur doit s'arrêter, sinon il descend jusqu'à zéro pour rien.
          if (!tracking.active)
            Text(
              'Le technicien est arrivé.',
              style: TextStyle(
                color: colors.success,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            )
          else
            Text(
              '$technicianName · vers la zone du client',
              style: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
            ),
        ],
      ),
    );
  }
}
