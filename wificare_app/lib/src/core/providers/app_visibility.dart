import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Signe de vie de l'application, pour les canaux qui ne doivent pas tourner
/// en arrière-plan.
///
/// Android suspend une connexion réseau dès que l'application passe en arrière-plan, mais le socket n'est pas forcément fermé : le réseau mobile peut la laisser ouverte en attente, et une tentative de reconnexion partirait alors pour rien, en consommant batterie et forfait. Les canaux de ce genre se ferment donc au passage en arrière-plan, et rouvrent au retour.
class AppVisibilityNotifier extends ChangeNotifier with WidgetsBindingObserver {
  AppVisibilityNotifier() {
    WidgetsBinding.instance.addObserver(this);
  }

  bool _foreground = true;

  /// L'application est-elle au premier plan ?
  bool get isForeground => _foreground;

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = state == AppLifecycleState.resumed;

    if (foreground == _foreground) return;

    _foreground = foreground;
    notifyListeners();
  }
}

final appVisibilityProvider = Provider<AppVisibilityNotifier>((ref) {
  final notifier = AppVisibilityNotifier();

  ref.onDispose(notifier.dispose);

  return notifier;
});

/// `true` quand l'application est au premier plan.
final isForegroundProvider = Provider<bool>(
  (ref) => ref.watch(appVisibilityProvider.select((notifier) => notifier.isForeground)),
);