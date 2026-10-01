import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers/infra_providers.dart';
import '../data/auth_repository.dart';

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    api: ref.watch(apiClientProvider),
    storage: ref.watch(tokenStorageProvider),
  ),
);

/// Source de vérité de l'authentification.
///
/// `AsyncValue<Session?>` : `data == null` signifie « non connecté ».
/// Les erreurs de connexion ne sont pas stockées dans l'état (pour ne pas
/// confondre « erreur » et « déconnecté ») : `login()` lève `ApiException` et
/// l'écran affiche le message.
class AuthController extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() async {
    // Une session expirée pendant l'utilisation de l'app renvoie à /login.
    ref.read(apiClientProvider).onSessionExpired = () {
      state = const AsyncValue.data(null);
      ref.read(routerRefreshProvider).trigger();
    };

    return ref.read(authRepositoryProvider).restore();
  }

  Session? get session => state.value;

  bool get isAuthenticated => session != null;

  /// Exécute une opération d'authentification en publiant son état.
  ///
  /// `AsyncValue.guard` avale l'exception : l'écran n'avait donc aucun moyen de
  /// l'afficher et un refus du serveur (numéro déjà utilisé, type de compte
  /// incohérent) restait muet. L'erreur est à la fois consignée dans l'état et
  /// relancée à l'appelant, qui sait quel champ en faire.
  ///
  /// Le routeur n'est reconstruit que sur un succès : le reconstruire sur
  /// un échec recrée la page de connexion, ce qui efface la saisie en cours et
  /// le message que l'écran vient d'afficher.
  Future<void> _run(Future<Session> Function() action) async {
    try {
      state = AsyncValue.data(await action());
    } catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
      rethrow;
    }

    // La session vient d'être créée : le routeur doit recalculer la
    // destination (accueil client ou technicien).
    ref.read(routerRefreshProvider).trigger();
  }

  /// Connexion par mot de passe (compte créé via `/auth/register`).
  ///
  /// [accountType] est le type choisi dans l'écran de connexion : le serveur
  /// refuse un compte qui ne correspond pas.
  Future<void> loginWithPassword({
    required String phone,
    required String password,
    required AccountType accountType,
  }) async {
    state = const AsyncValue.loading();
    await _run(
      () => ref.read(authRepositoryProvider).login(
            phone: phone,
            password: password,
            accountType: accountType,
          ),
    );
  }

  /// Création de compte puis connexion immédiate.
  Future<void> register({
    required AccountType accountType,
    required String firstName,
    required String lastName,
    required String phone,
    required String password,
    String? zoneName,
    String? zoneLocation,
  }) async {
    state = const AsyncValue.loading();
    await _run(
      () => ref.read(authRepositoryProvider).register(
            accountType: accountType,
            firstName: firstName,
            lastName: lastName,
            phone: phone,
            password: password,
            zoneName: zoneName,
            zoneLocation: zoneLocation,
          ),
    );
  }

  Future<void> refreshProfile() async {
    final current = session;
    if (current == null) return;

    try {
      final fresh = await ref.read(authRepositoryProvider).me();
      state = AsyncValue.data(fresh);
    } on ApiException catch (error) {
      if (!error.isUnauthorized) {
        // On conserve la session : un échec réseau ne doit pas déconnecter.
        return;
      }
      state = const AsyncValue.data(null);
      ref.read(routerRefreshProvider).trigger();
    }
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncValue.data(null);
    ref.read(routerRefreshProvider).trigger();
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, Session?>(
  AuthController.new,
);

/// Dossier client de l'utilisateur connecté (null pour un technicien/admin).
final clientAccountProvider = Provider<ClientAccount?>(
  (ref) => ref.watch(authControllerProvider).value?.client,
);

final currentUserProvider = Provider<AppUser?>(
  (ref) => ref.watch(authControllerProvider).value?.user,
);
