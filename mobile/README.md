# WiFi Care — application mobile

Application **Flutter 100 % Android** du projet WiFi Care, à deux espaces selon le
rôle : propriétaire de zone (client) et technicien.

L'API qu'elle consomme se trouve à la **racine du dépôt** (`..`), dossier qui
contient aussi le tableau de bord web. Voir le [`README`](../README.md) principal
pour le démarrage complet, et [`AGENTS.md`](AGENTS.md) pour les règles de
conception.

## Démarrage

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
```

`10.0.2.2` est l'alias de la machine hôte depuis l'émulateur Android ; depuis
un téléphone physique, utiliser l'IP LAN du serveur. L'URL est obligatoire : sans
`--dart-define`, l'application ne peut pas joindre le backend.

## Observabilité (PostHog)

Le token PostHog est injecté à la compilation, comme l'URL de l'API :

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api \
  --dart-define=POSTHOG_TOKEN=phc_...
```

Sans `--dart-define=POSTHOG_TOKEN`, le service d'analytics est
**désactivé** et l'application fonctionne exactement comme avant.
C'est le comportement d'un développement local, pas une panne.

Ce qui est tracé : les vues d'écran (`PosthogObserver` sur le
`GoRouter`), la connexion (`login_attempted`, avec son motif
d'échec — code HTTP, jamais le message), l'inscription
(`account_created`), et la création de demande (`ticket_created`,
type et priorité seulement). L'identifiant est celui de la base,
**jamais** le numéro de téléphone.

Deux comportements sont délibérés :

- **Aucune personne avant la connexion** (`personProfiles:
  identifiedOnly`) : un téléphone qui ouvre l'application sans se
  connecter ne crée pas de profil.
- **`reset()` à la déconnexion** : un téléphone partagé — un
  technicien sur l'appareil d'un collègue — verrait sinon ses
  événements rattachés au compte précédent.

Le manifeste Android désactive l'auto-init du SDK
(`com.posthog.posthog.AUTO_INIT=false`) : la configuration vient
du Dart, ce qui permet de désactiver PostHog sans recompiler le
manifeste. `minSdk` est abaissé à 23 au maximum — le plancher du
SDK PostHog — sans jamais descendre en dessous de ce que le
plugin Flutter choisit.

## Comptes de démonstration

Mot de passe `1234`, avec le type de compte demandé à la connexion.

| Type | Numéro |
| --- | --- |
| Propriétaire de zone | `2250707070707` |
| Technicien | `2250102030405` |

## Commandes utiles

```bash
flutter analyze     # doit rester à 0 problème
flutter test        # parcours client + technicien
flutter build apk --release --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
```
