import 'package:flutter/foundation.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

import '../config/env.dart';

/// Service d'observabilité PostHog.
///
/// Le SDK PostHog est un singleton natif (`Posthog()`) : il est
/// initialisé une fois, avant `runApp`, et partagé ensuite par toute
/// l'application. Ce service l'enveloppe pour deux raisons :
///
/// 1. **Le token peut être absent.** Un build de développement local
///    n'en a pas forcément. Sans lui, chaque méthode rend la main
///    sans rien envoyer — l'application fonctionne exactement comme
///    avant l'intégration.
/// 2. **Les envois ne doivent jamais casser l'application.** Un
///    appel réseau vers PostHog qui échoue (mode avion, serveur
///    injoignable) est avalé : une panne d'observabilité ne doit
///    pas devenir une panne de l'application.
///
/// Ce que le service applique à chaque envoi, et que le SDK ne
/// garantit pas : aucune donnée personnelle. Les méthodes ci-dessous
/// prennent des identifiants et des noms de champs, jamais de
/// valeurs — ni numéro de téléphone, ni mot de passe, ni nom de
/// client.
class AnalyticsService {
  AnalyticsService._();

  /// PostHog est-il configuré sur ce build ?
  ///
  /// Un token vide désactive tout : c'est le comportement attendu
  /// d'un développement local, pas un défaut.
  static bool get isEnabled => AppConfig.posthogToken.isNotEmpty;

  /// Initialise le SDK.
  ///
  /// À appeler **une seule fois**, avant `runApp`, après
  /// `WidgetsFlutterBinding.ensureInitialized()`. L'appel est
  /// asynchrone : le configurer trop tard laisserait les événements
  /// du démarrage sans destination.
  ///
  /// `personProfiles: identifiedOnly` est le choix important : aucune
  /// personne n'est créée tant qu'un compte ne s'est pas connecté.
  /// Sans lui, chaque téléphone qui ouvre l'application créerait un
  /// profil anonyme, et les événements d'un propriétaire seraient
  /// mélangés à ceux du technicien qui lui succède sur l'appareil.
  static Future<void> setup() async {
    if (!isEnabled) return;

    try {
      final config = PostHogConfig(AppConfig.posthogToken);
      config.host = AppConfig.posthogHost;
      config.personProfiles = PostHogPersonProfiles.identifiedOnly;

      // Le journal détaillé n'a de sens qu'en développement : en
      // production, il encombre le logcat sans rien apporter.
      // `kDebugMode` est constant à la compilation, donc ce
      // branchement disparaît du build release.
      config.debug = kDebugMode;

      // L'application Flutter ne contient pas de dossier `web/` : le
      // SDK est un no-op sur le web, et cette configuration ne sert
      // donc que sur Android.
      await Posthog().setup(config);
    } catch (error) {
      // Un échec d'initialisation ne doit pas empêcher l'application
      // de démarrer. PostHog sera muet, l'application non.
      // ignore: avoid_print
      print('PostHog : initialisation impossible ($error)');
    }
  }

  /// Associe les événements au compte connecté.
  ///
  /// [userId] est l'identifiant de base, **pas** le numéro de
  /// téléphone : le numéro est une donnée personnelle que PostHog n'a
  /// pas à connaître, et il change. Le rôle permet de segmenter les
  /// analyses (un technicien et un propriétaire n'ont pas les mêmes
  /// parcours) sans exposer d'identité.
  ///
  /// Silencieuse quand PostHog est désactivé.
  static Future<void> identify({
    required String userId,
    String? role,
  }) async {
    if (!isEnabled) return;

    // Construite à la main plutôt que par un `if` dans le littéral :
    // la propriété n'est envoyée que quand le rôle est connu, et
    // jamais avec une valeur nulle que PostHog lirait comme un
    // effacement.
    final userProperties = <String, Object>{};
    if (role != null) {
      userProperties['role'] = role;
    }

    try {
      await Posthog().identify(
        userId: userId,
        userProperties: userProperties,
      );
    } catch (error) {
      // L'observabilité est secondaire : un échec d'identification
      // ne doit pas interrompre une connexion qui vient de réussir.
      // ignore: avoid_print
      print('PostHog : identification impossible ($error)');
    }
  }

  /// Efface l'identité et les propriétés de la session.
  ///
  /// À appeler à la déconnexion. Sans `reset()`, le compte suivant
  /// sur le même téléphone hériterait de l'identité du précédent :
  /// ses événements seraient rattachés à un compte qui n'est plus le
  /// sien — le défaut le plus grave d'une intégration analytics sur
  /// un téléphone partagé.
  static Future<void> reset() async {
    if (!isEnabled) return;

    try {
      await Posthog().reset();
    } catch (error) {
      // ignore: avoid_print
      print('PostHog : réinitialisation impossible ($error)');
    }
  }

  /// Envoie un événement.
  ///
  /// Les propriétés portent des **noms de champs et des valeurs
  /// non personnelles** : un statut, un type, un identifiant de
  /// demande. Jamais un numéro, un mot de passe, un nom de client ou
  /// une description de panne.
  ///
  /// L'échec est avalé : un envoi raté (mode avion) ne doit pas
  /// faire échouer l'opération métier qui l'a déclenché.
  static Future<void> capture(
    String eventName, {
    Map<String, Object>? properties,
  }) async {
    if (!isEnabled) return;

    try {
      await Posthog().capture(
        eventName: eventName,
        properties: properties,
      );
    } catch (error) {
      // ignore: avoid_print
      print('PostHog : envoi impossible ($error)');
    }
  }
}
