import '../../../core/domain/json_x.dart';

/// Point de position enregistré côté serveur pour une demande suivie.
///
/// L'API renvoie la distance et l'ETA qu'elle a recalculées : ce sont ces deux
/// nombres que voit le client, et les afficher ici évite au technicien de les
/// deviner. Aucun modèle commun ne porte cette notion — le suivi n'existe que du
/// côté technicien — d'où une entité propre à la feature.
class TrackingPoint {
  const TrackingPoint({
    required this.ticketId,
    this.distanceMeters,
    this.etaMinutes,
    this.destination,
    this.startedAt,
    this.recordedAt,
  });

  factory TrackingPoint.fromJson(Map<String, dynamic> json) {
    return TrackingPoint(
      ticketId: JsonX.str(json['ticketId']),
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
      etaMinutes: (json['etaMinutes'] as num?)?.toInt(),
      destination: JsonX.strOrNull(json['destination']),
      startedAt: JsonX.date(json['startedAt']),
      recordedAt: JsonX.date(json['recordedAt']),
    );
  }

  final String ticketId;

  /// Distance restante jusqu'à la zone du client, en mètres.
  ///
  /// `null` quand la zone n'a pas de coordonnées : l'API ne peut alors rien
  /// calculer, et afficher une distance fausse serait pire que l'absence.
  final double? distanceMeters;

  /// Arrivée estimée, en minutes.
  final int? etaMinutes;

  final String? destination;
  final DateTime? startedAt;
  final DateTime? recordedAt;

  /// Distance formatée en mètres ou kilomètres.
  String get formattedDistance {
    final meters = distanceMeters;
    if (meters == null) return '—';
    if (meters < 1000) return '${meters.round()} m';
    return '${(meters / 1000).toStringAsFixed(1)} km';
  }
}
