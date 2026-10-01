# WiFi Care

Plateforme de gestion d'interventions réseau pour des zones Wi-Fi : un client
(propriétaire de zone) signale une panne, un technicien la traite, et les deux
sont informés à chaque étape.

Le dépôt est un **monodépôt** :

| Dossier | Rôle |
| --- | --- |
| `src/`, `prisma/` | API Next.js (App Router) + schéma Prisma, sert le web et l'application mobile |
| `wificare_app/` | application Flutter Android (client **et** technicien) |

---

## 1. Fonctionnalités

### Espace client (propriétaire de zone)

Authentification, inscription en trois étapes, tableau de bord, zones Wi-Fi,
équipements, demandes de panne avec photos, factures et profil.

### Espace technicien

Compte **distinct** du client : le technicien reçoit des demandes et les fait
avancer. Il ne gère ni zone, ni équipement, ni facture — ces notions
n'apparaissent nulle part dans son interface, et l'API les lui refuse (`403`).

### Cycle de vie d'une demande et notifications

Les notifications sont **in-app**, sans service de push : aucun Firebase, aucun
APNs, aucune messagerie externe à configurer.

| Événement | Destinataires |
| --- | --- |
| Soumission d'une demande, aucun technicien `ACTIVE` unique | administrateurs |
| Attribution automatique ou manuelle | technicien **et** client |
| Changement de statut par le technicien | client |

L'attribution automatique n'a lieu que s'il existe **exactement un** technicien
`ACTIVE`. Sinon la demande reste en `NEW` et attend une répartition manuelle.

Côté mobile, une cloche avec badge de non-lus figure dans les deux tableaux de
bord, et l'écran *Notifications* (une page enfant de l'accueil, comme le profil)
permet de tout marquer comme lu ou d'ouvrir directement la demande concernée.

---

## 2. Démarrage rapide

### Prérequis

| Outil | Version testée |
| --- | --- |
| Node.js | 20+ (validé sur 26.7) |
| PostgreSQL | via Neon, ou local |
| Flutter | 3.x (SDK Dart 3) |
| JDK | 17 |
| Android SDK | API 24+ |

### API

```bash
npm install
cp .env.example .env      # puis renseigner DATABASE_URL et NEXTAUTH_SECRET
npx prisma generate
npx prisma db push        # crée le schéma (ou `npx prisma migrate deploy`)
npx prisma db seed        # comptes de démonstration
npm run dev
```

L'API écoute sur <http://localhost:3000>. Son état est vérifiable via
`GET /api/health`.

**Variables d'environnement** (`.env`, jamais versionné) :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | chaîne de connexion PostgreSQL |
| `NEXTAUTH_SECRET` | secret de signature des jetons |
| `NEXTAUTH_URL` | URL publique de l'application |

### Application mobile

```bash
cd wificare_app
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
```

`10.0.2.2` est l'alias de la machine hôte depuis l'émulateur Android. Depuis
un téléphone physique, utiliser l'IP LAN du serveur.

L'URL de l'API est injectée à la compilation via `--dart-define` ; sans elle,
l'application ne peut pas joindre le backend.

---

## 3. Comptes de démonstration

Mot de passe `1234` pour tous, mot de passe normalisé par
`src/lib/phone.ts`.

| Rôle | Numéro | Espace |
| --- | --- | --- |
| Propriétaire de zone | `2250707070707` | client |
| Technicien | `2250102030405` | technicien |
| Administrateur | `2250505050505` | — (API) |

La connexion exige le **type de compte** en plus du téléphone : le serveur
refuse (`403`) un compte qui ne correspond pas au type choisi.

---

## 4. API

Toutes les réponses sont enveloppées (`{ "data": ... }` ou
`{ "error": "..." }`). Les routes protégées attendent un en-tête
`Authorization: Bearer <accessToken>`.

| Méthode | Route | Accès |
| --- | --- | --- |
| `POST` | `/api/auth/register` | public |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/refresh` | refresh token |
| `POST` | `/api/auth/logout` | authentifié |
| `GET` | `/api/auth/me` | authentifié |
| `GET` | `/api/tickets` | client (ses demandes) ou technicien (ses affectations) |
| `POST` | `/api/tickets` | client |
| `GET` | `/api/tickets/:id` |(client ou technicien concerné) |
| `PATCH` | `/api/tickets/:id/assign` | administrateur |
| `PATCH` | `/api/tickets/:id/status` | technicien, sur ses seules demandes |
| `GET` | `/api/wifi-zones` | client |
| `POST` | `/api/wifi-zones` | client (un technicien reçoit `403`) |
| `GET` | `/api/quote-invoices` | client |
| `GET` | `/api/notifications` | authentifié |
| `PATCH` | `/api/notifications` | authentifié — tout marquer comme lu |
| `PATCH` | `/api/notifications/:id` | authentifié — une notification |
| `GET` | `/api/health` | public |

Un client ne peut pas faire avancer le statut d'une demande ; un technicien ne
peut agir que sur les demandes qui lui sont affectées.

---

## 5. Construire l'APK

```bash
cd wificare_app
flutter build apk --release --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
# -> wificare_app/build/app/outputs/flutter-apk/app-release.apk
```

Pour une URL publique, remplacer `10.0.2.2:3000` par l'adresse du serveur
accessible depuis les appareils.

L'APK n'est pas versionné dans Git (binaire de 57 Mo). Les releases
GitHub fournissent le fichier prêt à installer.

### Ce qui est versionné, et pourquoi

Le dépôt contient tout ce qui est nécessaire pour reconstruire l'APK à
l'identique :

- `wificare_app/pubspec.lock` — versions exactes des paquets Dart ;
- `wificare_app/android/gradle/wrapper/` — Gradle 9.3.1 figé, avec
  `gradlew` et le wrapper, **contre le modèle Flutter par défaut** : sans eux,
  un clone ne peut pas compiler tant que Gradle n'a pas été téléchargé à la
  main ;
- `package-lock.json` à la racine — versions exactes des dépendances Node.

En revanche, les caches et artefacts (`build/`, `.dart_tool/`,
`android/.gradle/`, `node_modules/`) sont exclus : ils se régénèrent avec
`flutter pub get`, `flutter build` et `npm install`. C'est aussi ce qui évite
d'ajouter 2,5 Go de fichiers générés au dépôt.

`android/local.properties` est exclu parce qu'il contient les chemins absolus du
SDK sur la machine du développeur ; `flutter build` le régénère.

---

## 6. Tests et qualité

```bash
# API
npx tsc --noEmit
npm run lint

# Application
cd wificare_app
flutter analyze     # doit rester à 0 problème
flutter test
```

Le projet web n'a pas de suite de tests automatisés : les règles
d'affectation, de notification et de contrôle d'accès ont été validées en
direct contre la base, via les endpoints ci-dessus.

---

## 7. Architecture de l'application mobile

Feature-first, en couches. Aucune génération de code
(`freezed`, `json_serializable`, `build_runner`) : les modèles font leur
`fromJson` à la main.

```
lib/src/
  core/          thème, routeur, réseau (Dio), stockage chiffré, widgets
  features/<x>/
    data/          repositories — seule couche qui parle à l'API
    application/   providers et contrôleurs Riverpod
    presentation/  écrans et widgets
```

Deux espaces séparés, dispatchés par rôle à la connexion :
`/home/...` pour le client, `/tech/...` pour le technicien. Ouvrir l'URL de
l'espace de l'autre rôle depuis un compte connecté redirige vers le sien.

Les détails de conception sont dans [`wificare_app/AGENTS.md`](wificare_app/AGENTS.md).

---

## Stack

| Besoin | Technologie |
| --- | --- |
| API | Next.js 16 (App Router), React 19 |
| ORM / base | Prisma 5, PostgreSQL (Neon) |
| Auth | JWT maison (`jsonwebtoken`), refresh single-flight |
| État / DI (mobile) | Riverpod |
| Navigation (mobile) | `go_router` |
| HTTP (mobile) | `dio` avec intercepteurs de jeton |
| Stockage (mobile) | `flutter_secure_storage` |
