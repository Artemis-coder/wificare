import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/enums.dart';
import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers/app_visibility.dart';
import '../../auth/application/auth_controller.dart';
import 'technician_providers.dart';

/// Disponibilité du technicien, et file des demandes qui lui sont proposées.
///
/// Un seul contrôleur pour les deux, parce qu'ils sont le même geste vu de deux
/// côtés : se mettre en ligne, c'est accepter que le circuit vous propose des
/// demandes ; les voir, c'est la conséquence. Les séparer obligerait à deux
/// états capables de se contredire — « disponible » sans file, ou une file sans
/// être disponible.
///
/// **Aucun échec n'est propagé**, comme `TechnicianTrackingController` : une
/// erreur va dans `state.message` et l'écran la montre. Une exception perdue ici
/// ferait échouer le bouton de disponibilité, et le technicien croirait
/// l'application cassée plutôt que le réseau coupé.
class AvailabilityState {
  const AvailabilityState({
    this.presence,
    this.offers = const <TaskOffer>[],
    this.message,
    this.messageIsPoll = false,
    this.loading = false,
    this.polling = false,
  });

  /// Ce que le serveur sait. `null` tant que la première lecture n'est pas
  /// revenue : afficher « hors ligne » avant la réponse ferait croire que le
  /// technicien s'est déconnecté alors qu'on ne sait rien.
  final TechnicianPresence? presence;

  /// Demandes proposées, en attente de réponse.
  final List<TaskOffer> offers;

  /// Message éphémère, affiché en bannière.
  final String? message;

  /// Ce message annonce une arrivée de la file, et non le résultat d'un geste.
  ///
  /// La boucle passe toutes les cinq secondes : elle remplace donc un tel
  /// message au passage suivant, qui n'a de sens que le temps d'un tic. Un motif
  /// d'action — une demande refusée, une prise perdue pour un autre, un refus du
  /// serveur — ne s'efface pas ainsi : le technicien l'avait sous les yeux
  /// depuis une seconde à peine, et une bannière disparue avant d'avoir été lue
  /// n'apprend rien.
  final bool messageIsPoll;

  /// Un changement de disponibilité est en cours.
  final bool loading;

  /// Une lecture de la file est en cours.
  final bool polling;

  bool get isOnline => presence?.isOnline ?? false;

  /// Le technicien s'est déclaré disponible, mais son application ne parle plus
  /// au serveur depuis un moment : il ne recevra rien de ce circuit.
  bool get isUnreachable => presence?.isStale ?? false;

  bool get hasOffers => offers.isNotEmpty;

  AvailabilityState copyWith({
    TechnicianPresence? presence,
    List<TaskOffer>? offers,
    String? message,
    bool? messageIsPoll,
    bool? loading,
    bool? polling,
    bool clearMessage = false,
  }) => AvailabilityState(
    presence: presence ?? this.presence,
    offers: offers ?? this.offers,
    message: clearMessage ? null : (message ?? this.message),
    // Un message écrit remplace le précédent, et l'est par nature : seul le
    // passage de la file le déclare tel qu'il est.
    messageIsPoll: clearMessage
        ? false
        : message != null
        ? (messageIsPoll ?? false)
        : (messageIsPoll ?? this.messageIsPoll),
    loading: loading ?? this.loading,
    polling: polling ?? this.polling,
  );
}

/// Cadence de la boucle de répartition.
///
/// Cinq secondes, et non trente comme le rafraîchissement des notifications :
/// ce n'est pas une liste affichée, c'est le tic qui fait circuler les demandes
/// entre les techniciens en ligne. Le passage suivant est aussi celui qui expire
/// les propositions restées sans réponse, donc une cadence plus longue
/// maintiendrait une demande en otage chez un technicien qui ne répond plus.
///
/// La boucle ne tourne qu'application ouverte : en arrière-plan, c'est le push
/// qui apporte la demande. Un téléphone qui interroge le serveur toutes les
/// cinq secondes pendant une journée entière viderait sa batterie pour un
/// résultat que le push obtient gratuitement.
const Duration kDispatchPollInterval = Duration(seconds: 5);

final availabilityProvider =
    NotifierProvider<AvailabilityController, AvailabilityState>(
      AvailabilityController.new,
    );

class AvailabilityController extends Notifier<AvailabilityState> {
  Timer? _timer;

  /// Empêche deux lectures simultanées : une réponse tardive ne doit pas
  /// remplacer un état plus récent par un état plus ancien.
  bool _inFlight = false;

  @override
  AvailabilityState build() {
    // Ces deux lectures rebuilding le contrôleur sont tout l'intérêt de la
    // chose : la boucle se pose au passage en arrière-plan et se relève au
    // retour, sans que l'écran ait à s'en mêler.
    final isForeground = ref.watch(isForegroundProvider);
    final isTechnician = ref.watch(currentUserProvider)?.role == UserRole.technician;

    if (isTechnician && isForeground) {
      // Différé d'un tour de boucle : la première lecture écrit dans l'état, et
      // l'écrire pendant la construction du provider le ferait trop tôt pour
      // qu'un écran puisse l'observer.
      Future.microtask(refresh);
      _start();
    } else {
      _stop();
    }

    ref.onDispose(_stop);

    return const AvailabilityState();
  }

  /// Relit la file des offres, et fait au passage tourner la répartition.
  ///
  /// Le même appel rend la présence du technicien et ses demandes, et le serveur
  /// en profite pour proposer les demandes en attente à ceux qui sont
  /// disponibles : c'est de là que vient le tic de la boucle.
  Future<void> refresh() async {
    if (_inFlight) return;

    _inFlight = true;
    final previousCount = state.offers.length;

    // Le message précédent n'est effacé que s'il annonçait la file. Un motif
    // d'action vient d'être posé par le technicien ou par le serveur, et le tic
    // suivant ne doit pas le faire disparaître avant qu'il ait été lu.
    state = state.copyWith(polling: true, clearMessage: state.messageIsPoll);

    try {
      final poll = await ref.read(technicianRepositoryProvider).pollOffers();

      state = state.copyWith(
        presence: poll.presence,
        offers: poll.offers,
        polling: false,
      );

      if (poll.offers.length > previousCount) {
        state = state.copyWith(
          message: poll.offers.length > 1
              ? '${poll.offers.length} demandes sont disponibles.'
              : 'Une demande est disponible.',
          messageIsPoll: true,
        );
      }
    } on ApiException catch (error) {
      state = state.copyWith(polling: false, message: error.message);
    } catch (_) {
      state = state.copyWith(
        polling: false,
        message: 'Impossible de joindre le serveur.',
      );
    } finally {
      _inFlight = false;
    }
  }

  /// Se met en ligne ou hors ligne.
  ///
  /// L'état local n'est pas changé avant la réponse du serveur : le bouton reste
  /// en attente, et l'écran ne peut pas afficher un statut que le serveur n'a pas
  /// enregistré.
  Future<void> setOnline(bool online) async {
    if (state.loading) return;

    state = state.copyWith(loading: true, clearMessage: true);

    try {
      final presence = await ref
          .read(technicianRepositoryProvider)
          .setPresence(online: online);

      state = state.copyWith(presence: presence, loading: false);

      // Se mettre en ligne veut dire « je veux du travail maintenant » : la file
      // est relue dans la foulée plutôt qu'au tic suivant, pour ne pas laisser
      // le technicien attendre cinq secondes devant un écran vide.
      if (online) await refresh();
    } on ApiException catch (error) {
      state = state.copyWith(loading: false, message: error.message);
    } catch (_) {
      state = state.copyWith(
        loading: false,
        message: 'Impossible de changer votre disponibilité.',
      );
    }
  }

  /// Prend la demande proposée et renvoie la demande affectée.
  ///
  /// En cas de refus — un autre technicien a gagné — la proposition disparaît de
  /// la file : elle n'est plus à lui, et la laisser affichée la renverrait vers
  /// un bouton qui échouerait à chaque fois.
  Future<Ticket?> accept(TaskOffer offer) async {
    try {
      final ticket = await ref
          .read(technicianRepositoryProvider)
          .acceptOffer(offer.id);

      state = state.copyWith(
        offers: state.offers
            .where((item) => item.id != offer.id)
            .toList(growable: false),
      );
      ref.invalidate(technicianTicketsProvider);

      return ticket;
    } on ApiException catch (error) {
      // La file est relue **avant** que le motif ne soit écrit : la relecture
      // efface les messages, et un message posé avant elle disparaîtrait
      // aussitôt. L'ordre inverse ferait qu'un technicien ayant perdu la course
      // ne comprendrait pas pourquoi la proposition a disparu.
      await refresh();
      state = state.copyWith(message: error.message);
      return null;
    } catch (_) {
      state = state.copyWith(message: 'Impossible de prendre cette demande.');
      return null;
    }
  }

  /// Renonce à la demande proposée.
  ///
  /// La demande repart immédiatement chez les autres : le refus vient d'arriver,
  /// c'est le seul moment où le circuit peut encore tourner vite.
  Future<void> decline(TaskOffer offer) async {
    try {
      await ref.read(technicianRepositoryProvider).declineOffer(offer.id);

      state = state.copyWith(
        offers: state.offers
            .where((item) => item.id != offer.id)
            .toList(growable: false),
        message: 'Demande refusée. Elle est proposée aux autres techniciens.',
      );
    } on ApiException catch (error) {
      // Comme pour la prise, la file est relue avant que le motif ne soit
      // écrit : sinon la relecture l'effacerait.
      await refresh();
      state = state.copyWith(message: error.message);
    } catch (_) {
      state = state.copyWith(message: 'Impossible de refuser cette demande.');
    }
  }

  /// Ouvre une proposition précise, venue d'une notification push.
  ///
  /// La file est relue avant d'ouvrir quoi que ce soit : la proposition peut
  /// avoir été retirée entre le moment où le push est parti et celui où le
  /// technicien tape dessus. L'écran doit alors dire qu'elle n'est plus
  /// disponible, plutôt que d'ouvrir une demande que quelqu'un d'autre a prise.
  Future<TaskOffer?> openOffer(String offerId) async {
    await refresh();

    for (final offer in state.offers) {
      if (offer.id == offerId) return offer;
    }

    state = state.copyWith(message: 'Cette demande n’est plus disponible.');

    return null;
  }

  void _start() {
    _timer?.cancel();
    _timer = Timer.periodic(kDispatchPollInterval, (_) => refresh());
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
  }
}