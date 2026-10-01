import 'dart:async';
import 'dart:convert';

import '../../../core/domain/models.dart';
import '../../../core/network/api_client.dart';

/// Flux temps réel des notifications du compte connecté.
///
/// L'application était prévenue par relevé périodique : une demande pouvait
/// attendre la fin de l'intervalle, et rien n'arrivait si aucun écran n'était
/// ouvert. Le flux fournit la notification dès son écriture — l'application en
/// reçoit une même sans action de sa part.
///
/// Server-Sent Events plutôt que WebSocket : le sens est unique, le serveur
/// parle et le client écoute. Aucun paquet supplémentaire n'est nécessaire.
class NotificationStream {
  NotificationStream(this._api);

  final ApiClient _api;

  /// Délai avant de rouvrir le flux après une coupure réseau.
  ///
  /// Il croît jusqu'à [_maxBackoff] : sur un réseau instable, rouvrir
  /// immédiatement en boucle épuiserait la batterie et le forfait sans jamais
  /// laisser la connexion chanceuse aboutir.
  static const Duration _initialBackoff = Duration(seconds: 2);
  static const Duration _maxBackoff = Duration(seconds: 30);

  StreamController<AppNotification>? _controller;

  /// Attente de reconnexion en cours, conservée pour être annulée à la fermeture.
  Timer? _retryTimer;
  Completer<void>? _pendingRetry;

  bool _cancelled = false;

  /// Ouvre le flux et le rouvre après chaque coupure, tant que [isActive] dit
  /// que quelqu'un l'observe encore.
  Stream<AppNotification> listen({required bool Function() isActive}) {
    _cancelled = false;

    final controller = StreamController<AppNotification>.broadcast(
      onCancel: cancel,
    );

    _controller = controller;

    _run(isActive);

    return controller.stream;
  }

  /// Ferme le flux et annule toute reconnexion programmée.
  ///
  /// L'attente est annulée explicitement, et non laissée s'écouler : un minuteur
  /// encore armé à la fermeture de l'écran consommerait la batterie, et ferait
  /// échouer un test sur un minuteur en attente.
  void cancel() {
    _cancelled = true;

    _retryTimer?.cancel();
    _retryTimer = null;

    final pending = _pendingRetry;
    _pendingRetry = null;

    if (pending != null && !pending.isCompleted) {
      pending.complete();
    }

    _controller?.close();
    _controller = null;
  }

  Future<void> _run(bool Function() isActive) async {
    var backoff = _initialBackoff;

    while (!_cancelled && isActive()) {
      try {
        await for (final line in _api.eventStream('/notifications/stream')) {
          if (_cancelled) return;

          // Une notification reçue rétablit une connexion saine : on repart du
          // délai court, plutôt que de progressivement se verrouiller à trente
          // secondes après des incidents que le réseau a déjà oubliés.
          backoff = _initialBackoff;

          final payload = _decode(line);

          if (payload != null) {
            _controller?.add(AppNotification.fromJson(payload));
          }
        }
      } catch (_) {
        // Coupure réseau, session expirée, flux coupé par le serveur : rien de
        // tout cela n'est une faute de l'utilisateur et rien ne doit être
        // remonté à l'écran. La boucle rouvre, plus tard si nécessaire.
      }

      if (_cancelled || !isActive()) return;

      final completer = Completer<void>();

      _pendingRetry = completer;
      _retryTimer = Timer(backoff, () {
        if (!completer.isCompleted) completer.complete();
      });

      await completer.future;

      _pendingRetry = null;
      _retryTimer = null;

      if (_cancelled || !isActive()) return;

      final next = backoff * 2;

      backoff = next > _maxBackoff ? _maxBackoff : next;
    }
  }

  /// Extrait l'objet JSON d'une ligne `data:` du flux.
  ///
  /// Les commentaires de maintien en vie (lignes commençant par `:`) et les
  /// autres champs du format sont ignorés : seul l'événement de notification
  /// intéresse l'application.
  static Map<String, dynamic>? _decode(String line) {
    if (!line.startsWith('data:')) {
      return null;
    }

    try {
      final decoded = jsonDecode(line.substring(5).trim());

      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      // Un événement illisible est ignoré plutôt que de fermer le flux.
      return null;
    }
  }
}