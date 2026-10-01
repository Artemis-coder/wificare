# WiFi Care — application mobile (Flutter, Android)

Application **Flutter 100 % Android** qui remplace l'ancienne application
React Native/Expo (`wificare-mobile/`, désormais obsolète). Aucun code Expo,
React Native ni iOS dans ce projet.

## Stack

| Besoin | Package |
| --- | --- |
| État / DI | `flutter_riverpod` (Notifier, FutureProvider) |
| Navigation | `go_router` (imperatif, redirection auth) |
| HTTP | `dio` + intercepteurs (jeton, refresh single-flight) |
| Stockage chiffré | `flutter_secure_storage` |
| Photos | `image_picker` |
| Ouverture d'URL / téléphone / géo | `url_launcher` |
| Carte du trajet | `flutter_map` + `latlong2` |
| Cache d'images | `cached_network_image` |
| Formatage fr-FR | `intl` |

Aucune génération de code (`freezed`, `json_serializable`, `build_runner`) :
les modèles font leur `fromJson` à la main.

## Organisation (feature-first, en couches)

```
lib/
  main.dart                     runApp(ProviderScope(child: WiFiCareApp()))
  src/
    app.dart                    MaterialApp.router + thèmes
    core/
      config/env.dart           URL d'API via --dart-define
      domain/                   enums + entités + helpers JSON (aucune dépendance Flutter)
      network/                  ApiClient (dio) + ApiException
      providers/                 providers d'infrastructure partagés
      router/app_router.dart    routes, redirections, libellés d'onglets
      storage/token_storage.dart
      theme/                    WiFiColors (ThemeExtension) + AppTheme + tokens
      utils/formatters.dart
      widgets/                  bibliothèque de widgets réutilisables
    features/<feature>/
      data/                     repositories (seul couche qui parle à l'API)
      application/              providers/controllers Riverpod
      presentation/             écrans et widgets propres à la feature
```

Règles :

- **Aucun écran n'appelle `ApiClient` directement** : il passe par le
  repository de sa feature.
- **Aucun appel réseau dans un `build()`** : tout passe par un
  `FutureProvider` / `AsyncNotifier` pour bénéficier du cache, du loading et de
  l'annulation gérés par Riverpod.
- Les couleurs passent par `context.colors` (l'extension `WiFiThemeX`), jamais
  par une constante hexadécimale en dur hors de `app_colors.dart` et des
  couleurs sémantiques (statuts, priorités) de `core/domain/enums.dart`.
- Les espacements passent par `AppSpacing`, les rayons par `AppRadius`.
- Les libellés utilisateur sont **en français**, sans emoji.
- La marque passe par `core/widgets/app_logo.dart` (`AppLogo`), jamais par un
  `Icons.wifi_rounded` posé en dur : c'est ce widget qui applique l'arrondi du
  logo. L'asset est déclaré dans `pubspec.yaml`
  (`assets/logo/logo_wificare.png`).

## Comptes

Deux types de compte sont proposés à l'inscription (`POST /auth/register`) :

| Type | `accountType` | Rôle API | Effet |
| --- | --- | --- | --- |
| Technicien | `TECHNICIAN` | `TECHNICIAN` | aucun dossier client |
| Propriétaire de zone | `WIFI_ZONE_OWNER` | `CLIENT` | dossier client + première zone Wi-Fi |

L'inscription se fait en trois étapes avec un bouton d'action fixe en bas de
l'écran (« Retour » / « Continuer » puis « Créer mon compte ») :

1. informations personnelles : type de compte, nom, prénom, téléphone ;
2. zone : nom et emplacement — étape ignorée pour un technicien ;
3. sécurité : mot de passe et sa confirmation.

La connexion passe par le type de compte, le téléphone et le mot de passe de
**4 chiffres** (`kPasswordLength`) ; le serveur refuse un compte qui ne
correspond pas au type choisi. Les erreurs de saisie sont signalées deux fois :
message éphémère (`showAppSnackBar`) et erreur sous le champ concerné.

Comptes de démonstration (mot de passe `1234`) : propriétaire `2250707070707`,
technicien `2250102030405`.

L'application ne propose que ces deux types de compte : un compte
d'administration n'a pas d'espace mobile. Le back-office web connaît en plus le
super administrateur `2250909090909` et l'administrateur `2250505050505`.

Deux pièges d'affichage à ne pas réintroduire :

- `AsyncValue.guard` **avale** l'exception. Les écrans de connexion et
  d'inscription appellent `AuthController` dans un `try/catch` pour rattacher le
  message au bon champ : le contrôleur doit donc consigner l'erreur **et** la
  relancer (`_run`).
- `lib/src/app.dart` ne déclenche une redirection du `GoRouter` que lorsque la
  session apparaît ou disparaît. Déclencher sur chaque passage en chargement
  reconstruisait la page de connexion, ce qui effaçait la saisie en cours et le
  message d'erreur affiché.

Un `403` sur `/auth/login` signifie que le type de compte choisi ne correspond
pas au numéro saisi : le message est rattaché au sélecteur de type, jamais sous
le champ mot de passe.

Un propriétaire peut ajouter d'autres zones depuis l'onglet « Équipements »
(« Ajouter une zone » → `POST /api/wifi-zones`, dossier déduit du jeton).

## Espaces par rôle

La connexion dispatche sur deux espaces distincts, selon le rôle du compte :

| Rôle | Espace | Onglets |
| --- | --- | --- |
| `CLIENT` (propriétaire de zone) | `/home/...` | Accueil, Pannes, Équipements, Factures, Avis |
| `TECHNICIAN` | `/tech/...` | Accueil, Demandes, Avis |

Un utilisateur connecté qui ouvre l'URL de l'espace de l'autre rôle est
redirigé vers le sien (`redirect` du `GoRouter`). L'API applique la même règle :
un technicien reçoit `403` sur `POST /api/wifi-zones`.

### Espace technicien

Le technicien **reçoit des demandes et les traite**. Il ne gère ni zone Wi-Fi
ni équipement : ces notions n'apparaissent nulle part dans son interface, et
l'API les lui refuse.

- Requêtes bornées à `technicianId` (ses seules demandes affectées).
- Les indicateurs regroupent les statuts : « à traiter », « en cours »,
  « terminées » (`features/technician/domain/technician_filter.dart`).
  Les tuiles sont cliquables et pilotent le filtre de la liste.
- Le détail d'une intervention est orienté action : il propose les
  transitions autorisées par `TicketStatus.transitionsFrom`, libellées en
  verbs d'action (« Démarrer le déplacement », « Passer en réparation »).
- Son profil affiche son activité, pas ses zones.
- L'onglet « Avis » est **en lecture seule** : le technicien subit la note, il
  ne la rédige pas. `GET /api/evaluations` le borne à `technicianId`, sans quoi
  il pourrait lire ce que les clients ont pensé d'un collègue.

## Autorisations, et carte du trajet

Deux autorisations portent l'application : les **notifications** et la
**géolocalisation**. `core/permissions/permissions_service.dart` est leur point
d'entrée unique.

Android n'affiche la boîte de dialogue **qu'une fois**. Après un refus,
l'appel suivant ne déclenche rien et rend la main immédiatement : le seul
retour possible est alors `deniedForever`, qui doit mener aux **réglages du
téléphone** et pas à un bouton « Autoriser » qui ne mènera nulle part. C'est
tout l'intérêt de `LocationGrant`, qui sépare « on peut encore demander » de
« il faut passer par les réglages ».

L'écran d'accueil (`features/auth/presentation/onboarding_screen.dart`)
précède la connexion et explique les deux autorisations **avant** de les
demander. Un utilisateur qui refuse une fenêtre surgissante sans explication ne
la rouvrira jamais, et l'application perd ses notifications et ses ETA sans
avoir jamais su pourquoi. Le drapeau `onboardingSeen` est lu **avant
`runApp`** et injecté par override : la redirection du routeur est synchrone, elle
ne peut pas attendre une lecture de stockage à chaque navigation. L'écran ne
bloque rien — refuser est légitime, et les autorisations restent
modifiables dans les réglages.

Le technicien **repose la question au départ**, dans
`TechnicianTrackingController.start` : il vient d'appuyer sur « Démarrer le
déplacement », donc le suivi est précisément ce qu'il demande. La demande est
posée là où elle a du sens, et non au premier lancement seulement.

La carte (`core/widgets/trip_map_card.dart`) est **partagée par les deux
espaces** : le technicien et le client voient le même trajet, avec le point A
(technicien) et le point B (zone du client). Une seule implémentation, sinon les
deux écrans finissent par diverger et le technicien ne voit plus ce que voit le
client.

Trois règles que la carte tient :

- **L'ETA affichée est celle du serveur**, jamais recalculée localement. Un
  chiffre différent de l'estimation officielle donnerait deux vérités ;
- **rien n'est dessiné sans les deux points** (`TicketTracking.hasRoute`) : une
  carte ne montrant qu'un point immobile dans le vide ferait croire à un suivi
  cassé ;
- **la position du technicien est renvoyée au client** (`latitude`/`longitude`
  dans le résumé de suivi). Le client voit déjà où se trouve celui qui vient
  vers sa zone, et la position ne quitte jamais le trajet en cours.

Les tuiles viennent d'OpenStreetMap : **pas de clé API, pas de compte**. Le
passage à Google Maps se ferait dans le seul `_Map` ; l'attribution OSM doit
rester affichée tant que ce n'est pas fait.

`flutter_map` charge des tuiles réseau : aucun test widget ne peut le laisser
tourner tel quel. Le suivi se teste avec `installFakeGeolocator`
(`test/fake_api.dart`), qui intercepte l'interface de plateforme de
`geolocator` — un PermissionDialog d'Android n'existe pas dans un test.

## Notifications : in-app et push

Le cycle de vie d'une demande prévient les comptes concernés sur deux canaux
alimentés par la même écriture côté serveur (`lib/tickets.ts`) : la
notification in-app, et le push qui atteint le téléphone même application
fermée.

| Événement | Destinataires | Type |
| --- | --- | --- |
| Soumission d'une demande, aucun technicien `ACTIVE` unique | administrateurs | `TICKET_SUBMITTED` |
| Attribution automatique ou manuelle | technicien **et** client | `TICKET_ASSIGNED` |
| Changement de statut par le technicien | client | `TICKET_STATUS_CHANGED` |

L'attribution automatique n'a lieu que s'il existe **exactement un** technicien
`ACTIVE` : sinon la demande reste en `NEW` et attend une répartition
manuelle, et les administrateurs en sont informés.

Côté client (`lib/src/features/notifications/`), l'écran est une page enfant de
l'accueil de chaque espace, comme le profil :

- `/home/dashboard/notifications` et `/tech/dashboard/notifications` ;
- une cloche dans la barre des deux tableaux de bord, avec le nombre de non-lus ;
- une entrée « Notifications » dans les deux profils ;
- ouvrir une notification la marque comme lue puis mène au détail de la demande,
  dans l'espace du rôle connecté ;
- « Tout lire » vide le badge.

Le rafraîchissement est **déclenché, pas permanent** : `notificationFeedProvider`
est un `FutureProvider` mis en cache tant qu'un écran l'observe (cloche,
profil, liste), et l'écran des notifications le relance toutes les 30 s pendant
qu'il est visible, avec un `Timer` annulé dans `dispose`. Aucun timer ne survit
donc à la fermeture de l'écran.

### Push hors application

Une intervention assignée doit prévenir le technicien **application fermée** :
seule la notification in-app exigerait qu'il ouvre l'application, donc qu'il
soit devant son téléphone au bon moment. Le canal utilisé est Firebase Cloud
Messaging, le seul qui traverse Android sans maintenir de connexion — l'OS
répète lui-même la demande d'envoi jusqu'au retour du réseau.

`lib/src/core/push/push_service.dart` porte tout le canal push :

- `initialize()` démarre Firebase et pose les écouteurs. **Sans configuration,
  il absorbe l'échec** : l'application continue sur ses notifications in-app,
  car une plateforme qui perd ses notifications à cause d'un fichier manquant
  serait pire qu'une plateforme qui les affiche en retard.
- Premier plan : Firebase ne dessine rien, l'application affiche elle-même la
  notification (`flutter_local_notifications`) pour qu'elle soit identique à
  celle reçue en arrière-plan.
- Arrière-plan / application fermée : `firebaseMessagingBackgroundHandler`,
  obligatoirement fonction de premier niveau — Firebase l'exécute dans un
  isolate séparé où une méthode d'instance n'existe pas. Enregistrée dans
  `main.dart` avant `runApp`.
- Taper sur la notification ouvre la demande : l'identifiant est mis en attente
  par le service et consommé au retour dans l'application (`app.dart`,
  `didChangeAppLifecycleState`), dans l'espace du rôle connecté.

Android 13 rend l'affichage des notifications conditionné à une autorisation
explicite (`POST_NOTIFICATIONS`) : elle est demandée à la connexion, et un refus
est silencieux.

Le jeton est enregistré à chaque ouverture de session
(`AuthController._announceDevice`), et à chaque renouvellement Firebase
(`onTokenRefresh`) : un jeton périmé en silence ferait partir les notifications
de toute la journée dans le vide. L'annonce n'est **pas** attendue avant de
rendre la main à l'écran de connexion — Firebase peut mettre plusieurs
centaines de millisecondes à démarrer, et l'utilisateur resterait devant le
splash.

**Qui dessine la notification, et où ne pas le faire** : le serveur envoie un
message porteur d'un bloc `notification`. En arrière-plan ou application arrêtée,
**c'est le SDK Android qui l'affiche**, sur le canal `wificare_notifications`.
`firebaseMessagingBackgroundHandler` ne doit donc **pas** redessiner, sans quoi
l'utilisateur reçoit deux bulles et entend deux sons pour un seul message — le
défaut le plus visible du push, et invisible en test tant qu'on garde
l'application au premier plan. Au premier plan en revanche le SDK ne dessine
rien : c'est `onMessage` qui appelle `showLocalNotification`.

Le canal est créé à la connexion, avant l'enregistrement du jeton : un appareil
qui possède un jeton a donc toujours son canal. Les entrées
`default_notification_channel_id` et `default_notification_icon` du manifeste
sont le filet de sécurité pour le cas général — sans elles, un canal absent est
créé par le système en importance basse, donc muet.

**Ce qu'il reste à faire pour activer le push** : `google-services.json` est
déposé (`android/app/`), le plugin Gradle `com.google.gms.google-services` n'est
appliqué que s'il est présent pour que le build reste possible sans lui. Ce qui
manque est la variable **serveur** `FIREBASE_SERVICE_ACCOUNT` (secret de service
au format JSON) : sans elle, `lib/push.ts` se laisse tomber dans le silence et
seule la notification in-app fonctionne. L'écran `/admin/notifications` affiche
l'état du push pour que ce silence ne passe pas pour un succès.

Le désucrage de bibliothèque (`coreLibraryDesugaring`) est activé pour
`flutter_local_notifications` : sans lui, Gradle refuse de compiler.

## Navigation

L'espace client est un `StatefulShellRoute.indexedStack` : une branche par
onglet (`Accueil`, `Pannes`, `Équipements`, `Factures`).

Le profil n'est pas un onglet : c'est une page enfant de l'accueil
(`/home/dashboard/profile`), ouverte en touchant l'avatar du tableau de bord.
La barre d'onglets reste visible dessus, sur l'onglet `Accueil`. Les
notifications suivent la même règle, et restent donc dans l'espace du rôle :
une route partagée hors des deux `StatefulShellRoute` dupliquerait une clé de
page lors d'une poussée depuis une branche.

- La barre d'onglets reste affichée sur **toutes** les pages de l'espace
  client, y compris les pages enfants (détail d'une panne, formulaire de
  signalement, détail d'une facture).
- L'onglet actif est déduit de l'URL (`ClientShell._indexFor`), pas de
  l'historique de branche : ouvrir `/home/tickets/new` depuis l'accueil
  highlighte bien « Pannes ».
- Recliquer sur l'onglet courant ramène à sa page racine.
- **L'onglet « Accueil » ramène toujours à la racine**, même quand on vient
  d'une autre branche : le profil et les notifications sont des pages enfants
  du tableau de bord, donc la dernière page visitée de la branche « dashboard ».
  Sans cette exception (`shouldGoToTabRoot` dans `core/router/app_router.dart`),
  avoir consulté son profil une fois suffisait à ce que l'onglet Accueil
  rouvre le profil au lieu du tableau de bord — le bouton paraît alors ne rien
  faire. Les autres onglets gardent leur pile : revenir sur « Factures » après
  une facture rouvre cette facture.
- Chaque onglet conserve sa propre pile : revenir sur « Pannes » après une
  création réaffirme la liste, pas le formulaire.

## API

Base URL injectée à la compilation :

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
```

`10.0.2.2` est l'alias de la machine hôte depuis l'émulateur Android. Depuis un
téléphone physique, utiliser l'IP LAN du serveur. Les URLs relatives renvoyées
par l'API (pièces jointes) sont préfixées par `AppConfig.apiBaseUrl`.

Le backend est l'application Next.js à la **racine du dépôt** (`..`),
qui sert `/api/...`. L'application vit donc dans un sous-dossier du
monodépôt : ses chemins relatifs ne remontent que d'un niveau.

## Commandes

```bash
flutter pub get
flutter analyze                        # doit rester à 0 erreur
flutter test                           # parcours client + technicien
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
tool/build_release.sh                  # APK release prêt à distribuer
```

Avant de déclarer une tâche terminée : `flutter analyze` sans erreur ni
avertissement.

## Nom du fichier distribué

`flutter build apk` produit `app-release.apk` : le nom vient du module Gradle
et n'identifie rien pour la personne qui reçoit le fichier. **Ne pas compiler un
APK à distribuer avec `flutter build apk` directement** — passer par
`tool/build_release.sh`, qui renomme la sortie en
`build/app/outputs/flutter-apk/WiFiCare-<version>.apk` (version lue dans
`pubspec.yaml`) et vise la production par défaut.

Le renommage est fait en script, pas en Gradle : AGP 9 a retiré
`outputFileName` de son API de variants, il n'existe donc plus de moyen Supported
de renommer la sortie depuis `build.gradle.kts`.

Le nom de la marque est défini à trois endroits qui doivent rester alignés :

| Emplacement | Valeur |
| --- | --- |
| `tool/build_release.sh` (`APP_NAME`) | `WiFiCare` |
| `android/app/src/main/AndroidManifest.xml` (`android:label`) | `WiFiCare` |
| libellé et logo du back-office (`src/app/layout.tsx`) | `WiFiCare` |

La signature reste celle de debug : l'APK est installable, mais pas publiable
sur Google Play tant qu'une keystore de release n'a pas été générée.
