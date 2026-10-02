import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/enums.dart';
import '../../technician/application/technician_providers.dart';
import '../../notifications/application/notification_providers.dart';
import 'ticket_providers.dart';
import 'ticket_queries.dart';

/// Garde les listes de demandes synchronisées avec ce que le serveur vient
/// d'écrire.
///
/// Sans ce pont, une demande assignée par la régie — ou par l'attribution
/// automatique — n'apparaissait qu'au retour sur l'écran : le technicien
/// chargeait sa liste, la régie assignait la demande trente secondes plus tard,
/// et rien ne l'informa de l'événement le plus important de sa journée. Il
/// fallait donc actualiser à la main, sans savoir s'il l'avait déjà fait.
///
/// La notification **est** l'événement : le serveur en écrit une à chaque
/// changement d'état, et elle arrive par le flux temps réel. Il n'y a donc rien
/// à mesurer ni à sonder — la liste se relit quand le serveur dit qu'elle a
/// changé. Aucun minuteur, aucune fenêtre de quelques secondes pendant laquelle
/// l'écran ment.
///
/// Seul un ticket est invalidé, et par son identifiant : recharger toute la
/// liste à chaque notification ferait clignoter le contenu et effacerait la
/// position de défilement pour une demande qui n'a pas bougé.
final ticketSyncProvider = Provider<void>((ref) {
  final live = ref.watch(liveNotificationsProvider).value;

  if (live == null || live.isEmpty) return;

  // La dernière notification reçue suffit : les précédentes ont déjà été
  // traitées à leur arrivée.
  final notification = live.first;

  if (!_changesTickets(notification.type)) return;

  final ticketId = notification.ticketId;
  if (ticketId == null || ticketId.isEmpty) return;

  // Le détail de la demande concernée d'abord, puis la liste : un technicien
  // qui regarde la demande pendant qu'elle change voit l'ancien état jusque
  // dans son titre.
  ref.invalidate(ticketDetailProvider(ticketId));

  // Les deux espaces sont invalidés : une notification de devis atteint aussi
  // bien le client que le technicien, et chacun a sa propre liste.
  ref.invalidate(ticketListProvider);
  ref.invalidate(technicianTicketsProvider);
});

/// Cette notification annonce-t-elle un changement de demande ?
///
/// `ZONE_VALIDATED` et `ZONE_DELETED` portent aussi un `ticketId` — la zone
/// peut concerner une demande — mais ne la modifient pas. Les recharger n'y
/// changerait rien et ferait vibrer l'écran pour rien.
bool _changesTickets(AppNotificationType type) => switch (type) {
  AppNotificationType.ticketAssigned ||
  AppNotificationType.ticketStatusChanged ||
  AppNotificationType.ticketCanceled ||
  AppNotificationType.quoteSent ||
  AppNotificationType.quoteAccepted ||
  AppNotificationType.quoteRejected => true,
  AppNotificationType.ticketSubmitted ||
  AppNotificationType.zoneValidated ||
  AppNotificationType.zoneDeleted => false,
};