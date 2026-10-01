import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/domain/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers/infra_providers.dart';
import '../../notifications/data/push_token_repository.dart';
import '../data/auth_repository.dart';

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    api: ref.watch(apiClientProvider),
    storage: ref.watch(tokenStorageProvider),
  ),
);

final pushTokenRepositoryProvider = Provider<PushTokenRepository>(
  (ref) => PushTokenRepository(ref.watch(apiClientProvider)),
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

    final restored = await ref.read(authRepositoryProvider).restore();

    if (restored != null) {
      // L'annonce de l'appareil ne doit jamais retarder le démarrage : Firebase
      // peut mettre plusieurs centaines de millisecondes à s'initialiser, et
      // l'utilisateur resterait devant le splash pendant ce temps.
      unawaited(_announceDevice());
    }

    return restored;
  }

  /// Déclare cet appareil au serveur pour qu'il reçoive les notifications.
  ///
  /// Le jeton est enregistré à chaque ouverture de session : Firebase peut le
  /// renouveler à la réinstallation ou au changement d'appareil, et le serveur
  /// doit détenir le jeton valide le plus récent, sans quoi la notification
  /// d'une nouvelle demande partirait dans le vide.
  ///
  /// Silencieuse en cas d'échec : sans configuration Firebase, l'application
  /// continue de fonctionner sur ses notifications internes.
  Future<void> _announceDevice() async {
    try {
      final push = ref.read(pushServiceProvider);
      await push.initialize();

      if (!push.isAvailable) {
        return;
      }

      await push.requestPermission();

      await push.registerToken(
        ref.read(pushTokenRepositoryProvider).register,
      );

      // Un jeton peut être renouvelé plus tard sans que l'utilisateur se
      // reconnecte : c'est le seul moment où le serveur peut en être informé.
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        ref
            .read(pushTokenRepositoryProvider)
            .register(token)
            .catchError((_) => <String, dynamic>{});
      });
    } catch (error) {
      debugPrint('Annonce de l\'appareil impossible : $error');
    }
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
    // Le jeton est retiré avant la destruction de la session : l'API doit
    // encore reconnaître l'appelant. Sans cela, le téléphone continuerait de
    // recevoir les notifications du compte quitté.
    final push = ref.read(pushServiceProvider);

    if (push.isAvailable) {
      final token = await FirebaseMessaging.instance.getToken();

      if (token != null && token.isNotEmpty) {
        await ref
            .read(pushTokenRepositoryProvider)
            .unregister(token)
            .catchError((_) => <String, dynamic>{});
      }
    }

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
