import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../push/push_service.dart';
import '../storage/token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

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
