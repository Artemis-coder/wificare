import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../push/push_service.dart';
import '../storage/token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

/// L'écran d'accueil des autorisations a-t-il déjà été vu sur ce téléphone ?
///
/// Lu une fois avant `runApp` et figé ici : la redirection du routeur est
/// synchrone, elle ne peut pas attendre une lecture de stockage à chaque
/// navigation. Le passage devant l'écran ne remet pas la valeur à faux — il
/// n'y a rien à rafraîchir, une fois écrit, il n'est plus jamais reproposé.
final onboardingSeenProvider = Provider<bool>((ref) => false);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(tokenStorage: ref.watch(tokenStorageProvider));
});

/// Service de notification hors application.
///
/// Instance unique : Firebase ne doit être initialisé qu'une fois, et les
/// écouteurs de messages ne doivent pas être posés en double à chaque
/// reconnexion.
final pushServiceProvider = Provider<PushService>((ref) => PushService());

/// Notifie le `GoRouter` qu'il doit réévaluer ses redirections (connexion,
/// déconnexion, session expirée).
class RouterRefreshNotifier extends ChangeNotifier {
  void trigger() => notifyListeners();
}

final routerRefreshProvider = Provider<RouterRefreshNotifier>(
  (ref) => RouterRefreshNotifier(),
);
