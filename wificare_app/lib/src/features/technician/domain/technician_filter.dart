import '../../../core/domain/enums.dart';

/// Filtres de la liste des demandes technicien.
///
/// Le technicien raisonne par groupes (« à traiter », « en cours », …) alors
/// que la barre de l'API ne prend qu'un statut à la fois : le regroupement est
/// donc fait côté application, sur la liste déjà chargée.
enum TechnicianFilter {
  all('Toutes'),
  toDo('À traiter'),
  inProgress('En cours'),
  done('Terminées');

  const TechnicianFilter(this.label);

  final String label;

  /// Statuts couverts par le filtre.
  Set<TicketStatus> get statuses => switch (this) {
    TechnicianFilter.all => const {},
    TechnicianFilter.toDo => const {
      TicketStatus.created,
      TicketStatus.toVerify,
      TicketStatus.confirmed,
    },
    TechnicianFilter.inProgress => const {
      TicketStatus.assigned,
      TicketStatus.enRoute,
      TicketStatus.diagnosing,
      TicketStatus.pendingQuote,
      TicketStatus.repairing,
      TicketStatus.pendingPayment,
    },
    TechnicianFilter.done => const {
      TicketStatus.completed,
      TicketStatus.closed,
      TicketStatus.canceled,
    },
  };

  bool matches(TicketStatus status) =>
      this == TechnicianFilter.all || statuses.contains(status);
}
