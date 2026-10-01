import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../storage/token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(tokenStorage: ref.watch(tokenStorageProvider));
});

/// Notifie le `GoRouter` qu'il doit réévaluer ses redirections (connexion,
/// déconnexion, session expirée).
class RouterRefreshNotifier extends ChangeNotifier {
  void trigger() => notifyListeners();
}

final routerRefreshProvider = Provider<RouterRefreshNotifier>(
  (ref) => RouterRefreshNotifier(),
);
