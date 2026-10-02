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
