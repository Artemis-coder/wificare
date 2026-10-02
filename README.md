# WiFi Care

Plateforme de gestion d'interventions réseau pour des zones Wi-Fi : un
propriétaire de zone signale une panne, un technicien est désigné
automatiquement et la traite, la super administration suit le parc et valide les
zones déclarées. Tout le monde est informé à chaque étape.

Le dépôt est un **monodépôt** :

| Dossier | Rôle |
| --- | --- |
| `src/`, `prisma/` | application Next.js (App Router) : back-office web **et** API REST servie à l'application mobile |
| `mobile/` | application Flutter Android (client **et** technicien) |
| `design-system/` | palette, espacements et composants de référence, plus l'image de marque source |

> **Une seule base, un seul serveur.** Le back-office web et l'application mobile
> parlent la même base via la même API. Une règle métier écrite une fois dans
> `src/lib/` s'applique donc aux deux écrans : il n'existe pas de version « web »
> et de version « mobile » d'une même décision.

---

## Sommaire

1. [Fonctionnalités](#1-fonctionnalités)
2. [Rôles et périmètres](#2-rôles-et-périmètres)
3. [Wi-Fi Zones : déclaration, validation, suppression](#3-wi-fi-zones--déclaration-validation-suppression)
4. [Cycle de vie d'une demande](#4-cycle-de-vie-dune-demande)
5. [Notifications](#5-notifications)
6. [Démarrage rapide](#6-démarrage-rapide)
7. [Comptes de démonstration](#7-comptes-de-démonstration)
8. [Modèle de données](#8-modèle-de-données)
9. [API REST](#9-api-rest)
10. [Sécurité](#10-sécurité)
11. [Migrations de schéma](#11-migrations-de-schéma)
12. [Tests et qualité](#12-tests-et-qualité)
13. [Architecture du code](#13-architecture-du-code)
14. [Construire et distribuer l'APK](#14-construire-et-distribuer-lapk)
15. [Déploiement](#15-déploiement)
16. [Décisions et choix de conception](#16-décisions-et-choix-de-conception)

---

## 1. Fonctionnalités

### 1.1 Espace propriétaire de zone (`/home/...`, application mobile)

Authentification, inscription en trois étapes, tableau de bord, zones Wi-Fi et
équipements, signalement de panne avec photos, suivi du technicien en direct avec
ETA, factures et paiement Mobile Money, avis sur intervention, profil.

### 1.2 Espace technicien (`/tech/...`, application mobile)

Le compte technicien est **distinct** du client. Il reçoit des demandes et les
fait avancer ; il ne gère ni zone, ni équipement, ni facture — ces notions
n'apparaissent nulle part dans son interface, et l'API les lui refuse (`403`).

Son espace propose : ses demandes affectées filtrables par statut, le détail
orienté action qui ne propose que les transitions autorisées, l'envoi de la
position pendant le trajet (carte partagée avec le client), le dépôt du rapport
d'intervention, l'envoi d'un devis, son portefeuille d'encaissements et ses avis
reçus (en lecture seule).

### 1.3 Back-office web (super administration)

Le site web s'adresse à l'encadrement, pas aux particuliers. Il porte un
**super administrateur**, seul rôle d'administration, qui :

| Capacité | Écran |
| --- | --- |
| **Gérer les comptes** : création, changement de rôle, activation, suspension, réinitialisation du mot de passe, recherche et filtres | `/admin/utilisateurs` |
| **Suivre le nombre de comptes** par profil, et le nombre total | `/admin/utilisateurs`, `/` |
| **Piloter le parc Wi-Fi** : toutes les zones de tous les propriétaires, avec recherche, filtres, édition, suppression | `/zones` |
| **Valider les zones déclarées** par les propriétaires | `/zones` |
| **Intervenir** directement sur une zone : ouvre le formulaire de demande pré-positionné | `/zones` → `/tickets/new` |
| **Réaffecter** manuellement une demande | `/tickets/<id>` |
| **Lire les avis clients** et la note moyenne par technicien | `/admin/avis` |
| **Envoyer des campagnes de messages** à une audience | `/admin/notifications` |
| **Suivre l'exploitation** : volumes de demandes, urgences, factures en attente | `/` |

Le rôle `ADMIN` a été **fusionné dans `SUPER_ADMIN`** : les deux profils
désignaient la même régie, sans différence de droits réelle, et la séparation ne
produisait qu'une frontière à maintenir.

---

## 2. Rôles et périmètres

La plateforme compte **trois profils**. Ce sont des profils, pas des niveaux :
un super administrateur n'est pas « un technicien avec plus de droits », et un
client n'est pas « un technicien sans droits ».

| Rôle | Peut | Ne peut pas |
| --- | --- | --- |
| `SUPER_ADMIN`<br>*Super administrateur* | gérer toute la plateforme : comptes et rôles, parc Wi-Fi et validation des zones, répartition des interventions, avis, campagnes de messages | se supprimer ou se rétrograder lui-même s'il est le dernier actif |
| `TECHNICIAN`<br>*Technicien* | traiter les demandes qui lui sont affectées, envoyer sa position, déposer son rapport, rédiger un devis | voir les zones, les demandes d'autrui, le portefeuille d'un collègue, écrire un avis |
| `CLIENT`<br>*Propriétaire de zone* | déclarer ses zones et ses équipements, signaler et suivre les pannes de ses zones, accepter un devis, régler, laisser un avis | faire avancer le statut d'une demande, écrire le rapport d'intervention, agir sur la demande d'un autre propriétaire |

### 2.1 Le back-office est un outil de régie

Les trois rôles existent en base, mais ils ne se partagent pas les mêmes
écrans. Le back-office est réservé à la régie ; le technicien et le
propriétaire de zone ont chacun leur espace dans l'application mobile.

| Espace | Rôles | Ce qu'on y fait |
| --- | --- | --- |
| Back-office web | `SUPER_ADMIN` | comptes et rôles, parc Wi-Fi, validation des zones, répartition des interventions, devis et règlements en lecture |
| Application mobile, espace technicien | `TECHNICIAN` | traiter ses demandes, envoyer sa position, déposer son rapport, rédiger un devis |
| Application mobile, espace propriétaire | `CLIENT` | déclarer ses zones, signaler une panne, **accepter ou refuser un devis, le régler**, laisser un avis |

Deux conséquences, et elles sont voulues :

- **`lib/auth.ts` refuse la connexion web d'un compte `TECHNICIAN` ou
  `CLIENT`.** L'écran annonce l'application mobile plutôt que d'afficher un
  « identifiants incorrects » alors que le numéro et le mot de passe sont
  bons. `WEB_ROLES` (`lib/roles.ts`) porte la frontière.
- **Le devis se tranche dans l'application, pas dans le back-office.** La
  régie lit le devis et son règlement ; elle ne les change pas. Un bouton
  « accepter » côté régie serait de toute façon refusé par `decideQuote`, qui
  n'accepte qu'une décision du client concerné — l'interface ne protège pas la
  donnée, seule cette règle le fait.

Une page `/admin/*` conservait sa garde qui renvoie vers `/` : la racine
redirige désormais elle aussi vers `/login`, donc ces gardes ne font plus
reboucler personne.

### 2.2 Les règles vivent dans `src/lib/`, pas dans les écrans

| Fichier | Décide de |
| --- | --- |
| `src/lib/roles.ts` | libellés, rôles autorisés sur le web (`WEB_ROLES`), navigation, prédicats `isSuperAdmin` / `isStaff` / `canUseBackoffice` |
| `src/lib/user-admin.ts` | création et modification d'un compte, protections du dernier super administrateur |
| `src/lib/zones.ts` | cycle de vie des Wi-Fi Zones : déclaration, édition, validation, suppression |
| `src/lib/tickets.ts` | création, affectation automatique, réaffectation manuelle, droits de lecture et d'écriture sur une demande |
| `src/lib/quotes.ts` | décision du client sur un devis, règlement, et ce qui autorise une réparation |
| `src/lib/interventions.ts` | dépôt et complétion du rapport d'intervention |

Une page ou une route API **appelle** ces fonctions ; elle ne décide rien. C'est
ce qui garantit qu'une décision prise dans le back-office et la même décision
prise dans l'application mobile ne peuvent pas diverger.

### 2.3 `isStaff` est un alias d'`isSuperAdmin`

Les deux noms disent la même chose depuis la fusion des profils. `isStaff` reste
le terme employé par les écrans de régie, `isSuperAdmin` celui des écrans de
gestion de comptes ; les garder évite de réécrire les gardes existants et de
chercher lequel employer.

### 2.4 Le type de compte à la connexion

L'écran de connexion **ne demande plus** de type de compte : le back-office
n'accepte que la régie, et un sélecteur qui n'offre qu'une valeur est un
contrôle qui laisse croire à un choix.

Le contrôle n'a pas disparu, il a changé de forme. Le serveur compare toujours
le type annoncé au rôle réel et refuse (`403`) un compte qui ne correspond pas —
c'est ce qui empêche un propriétaire de se connecter sur l'écran du technicien.
Mais sur le web, le refus qui compte est l'autre : un compte `TECHNICIAN` ou
`CLIENT` dont le numéro et le mot de passe sont exacts est refusé avec un
message qui renvoie vers l'application mobile, pas avec « identifiants
incorrects ».

---

## 3. Wi-Fi Zones : déclaration, validation, suppression

Une zone n'existe pas seulement parce que son propriétaire l'a déclarée. Elle
entre dans le parc exploitable après validation.

### 3.1 Le cycle

| Étape | Qui | Où | Effet |
| --- | --- | --- | --- |
| **Déclaration** | propriétaire | application mobile, `POST /api/wifi-zones` | zone créée en `PENDING`, super administrateurs et propriétaire prévenu |
| **Déclaration** | super administrateur | `/admin/zones` | zone créée directement en `ACTIVE` : c'est la régie qui la saisit, elle n'a pas à attendre sa propre validation |
| **Validation** | super administrateur | `/zones` → *Valider* | zone passée en `ACTIVE`, propriétaire prévenu |
| **Retrait** | super administrateur | `/zones` → *Mettre en attente* | zone repassée en `PENDING`, propriétaire prévenu |
| **Suppression** | super administrateur | `/zones` → *Supprimer* | définitive, **refusée** si la zone porte des demandes |

### 3.2 Ce qu'une zone en attente ne peut pas faire

Une zone `PENDING` est déclarée mais pas reprise par la plateforme :

- elle **n'apparaît pas** dans le sélecteur de zone du formulaire de demande ;
- `POST /api/tickets` la **refuse** (`409`) ;
- l'application mobile affiche un bandeau sur l'onglet « Équipements » plutôt
  que de laisser le propriétaire découvrir la blockade en envoyant une panne qui
  aurait été refusée.

Elle peut en revanche **recevoir des équipements** : préparer son parc n'engage
à rien, et le refus ne visait que l'envoi d'un technicien sur un emplacement que
la plateforme n'a pas repris.

### 3.3 Pourquoi la suppression est refusée s'il y a des demandes

Une zone supprimée emporterait l'historique des interventions qu'elle a
générées. Cet historique est la seule chose qui dise **qui est intervenu, quand,
et pour quoi** ; le retirer ferait disparaître des interventions réelles d'un
dossier client sans laisser de trace. Le refus motive le compte de demandes en
cause plutôt que d'echouer silencieusement.

### 3.4 Ce que le super administrateur voit

`/zones` affiche le **parc complet**, tous propriétaires confondus, avec pour
chaque zone : le nom, l'emplacement, la date de déclaration, le propriétaire et
son contact, le statut de validation, le nombre d'équipements et le nombre de
demandes.

- **Recherche** sur le nom de la zone, son emplacement, le nom du propriétaire ou
  son contact.
- **Filtre** par statut de validation ; le tableau de bord renvoie ici avec
  `?status=PENDING` quand il annonce des zones à valider.
- **Tri** : les zones en attente passent en tête. Ce sont elles qui attendent une
  action, et les reléguer en bas de liste les faisait oublier.

Les zones en attente sont aussi comptées sur le tableau de bord, avec un bandeau
sur `/zones` : une zone déclarée est une décision en suspens, pas une ligne
perdue dans une liste.

---

## 4. Cycle de vie d'une demande

### 4.1 L'affectation est automatique

L'affectation d'une intervention n'est pas une décision humaine. À la création,
la demande part vers le **technicien le moins chargé** — celui qui porte le moins
de demandes en cours — dès qu'un technicien est en service.

| Règle | Pourquoi |
| --- | --- |
| Seuls les techniciens `ACTIVE` sont candidats | un compte suspendu ne peut pas se déplacer |
| La charge compte les demandes **non terminées** | compter une demande close reviendrait à envoyer la prochaine au technicien qui a, il y a six mois, traité le plus d'interventions |
| À charge égale, le **plus ancien compte** est servi | l'ordre reste stable et prévisible, au lieu de dépendre de l'arrivée de la première requête |
| **Aucun technicien en service** → la demande reste en `NEW` | personne ne peut la traiter ; les super administrateurs sont prévenus pour en nommer un ou en créer un |

La super administration n'intervient que pour **réaffecter manuellement** une
demande (`/tickets/<id>`), ou **nommer un technicien** sur une demande qui
n'attendait personne. Réaffecter une demande en cours prévient le technicien
précédent qu'elle lui est retirée, faute de quoi il se déplacerait pour une
intervention qui ne lui revient plus.

### 4.2 Les statuts

```
NEW ─→ TO_VERIFY ─→ ASSIGNED ─→ CONFIRMED ─→ EN_ROUTE ─→ DIAGNOSING
                                        │                    │
                                        │                    ├─→ PENDING_QUOTE ─→ REPAIRING ─┐
                                        │                    │   (devis en attente)  ↑       │
                                        │                    └────────────────────────────────┘
                                        │                                                 ↓
                                        └───────────────────────────────────────→ COMPLETED
                                                                                       │
                                                                    PENDING_PAYMENT ────┘
                                                                          │
                                                                          ↓
                                                                       CLOSED
```

N'importe quel statut peut aller à `CANCELED`.

`DIAGNOSING` est aussi atteint **automatiquement** au dépôt du rapport
d'intervention — sauf si la demande a déjà dépassé ce stade : compléter un
rapport après la facturation ne doit pas rouvrir un dossier que le client a
déjà soldé.

### 4.3 Trois règles qui ne sont pas négociables

**Le devis.** Une réparation ne démarre pas sur un devis que le client n'a pas
accepté. C'est lui qui autorise qu'on touche à son installation, et le technicien
qui a rédigé le devis ne peut pas s'accorder lui-même cette autorisation.

**Le rapport.** Seuls le technicien affecté et la super administration écrivent
le rapport d'intervention. Un client n'écrit pas le constat de sa propre panne,
et aucun compte ne décrit celle d'autrui.

**Le statut.** Un client suit sa demande, il ne la fait pas avancer. Un technicien
ne fait avancer que ses propres affectations.

---

## 5. Notifications

### 5.1 Trois canaux, une seule écriture

La notification **in-app** est la source de vérité : elle est persistée, donc
disponible hors ligne et après redémarrage. Le push Android (Firebase Cloud
Messaging) et le push Web Push (VAPID, pour les navigateurs du back-office) sont
déclenchés **après** cette écriture, à partir de la même source.

Un échec de notification **ne fait jamais échouer l'opération métier qui
l'appelle** : une notification perdue ne doit pas faire perdre une demande au
client. Les erreurs sont loguées, pas propagées.

### 5.2 Qui est prévenu de quoi

| Événement | Destinataires |
| --- | --- |
| Soumission d'une demande, aucun technicien en service | super administrateurs |
| Attribution automatique ou manuelle | technicien **et** client |
| Changement de statut | client |
| Annulation d'une demande | client |
| Zone Wi-Fi déclarée | super administrateurs **et** propriétaire |
| Zone validée, retirée du parc ou supprimée | propriétaire |
| Depôt ou complétion d'un rapport d'intervention | client |
| Campagne de messages | audience visée |

### 5.3 Le push est facultatif

Sans configuration Firebase, `src/lib/push.ts` se laisse tomber dans le silence
et tout continue de fonctionner en notification in-app. L'écran
`/admin/notifications` affiche l'état du push et le nombre de téléphones
réellement joignables par audience : **une campagne qui n'atteint personne est
visible avant l'envoi**, pas après.

---

## 6. Démarrage rapide

### 6.1 Prérequis

| Outil | Version testée |
| --- | --- |
| Node.js | 20+ (validé sur 26.7) |
| PostgreSQL | via Neon, ou local |
| Flutter | 3.x (SDK Dart 3) |
| JDK | 17 |
| Android SDK | API 24+ |

### 6.2 API et back-office

```bash
npm install
cp .env.example .env        # renseigner DATABASE_URL et NEXTAUTH_SECRET
npx prisma generate
npx prisma db push          # crée le schéma
npx prisma db seed          # comptes et jeu de démonstration
npm run dev
```

L'application écoute sur <http://localhost:3000>. Son état est vérifiable via
`GET /api/health`.

### 6.3 Variables d'environnement

| Variable | Requise | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | oui | chaîne de connexion PostgreSQL |
| `NEXTAUTH_SECRET` | oui | secret de signature des jetons — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | oui | URL publique, utilisée par NextAuth |
| `BROADCAST_CRON_SECRET` | non | protège `GET /api/cron/broadcasts` ; sans lui, l'envoi programmé est désactivé et la route le dit |
| `FIREBASE_SERVICE_ACCOUNT` | non | push Android ; JSON du secret de service, ou base64 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | non | push Web Push, browsers du back-office |
| `VAPID_PRIVATE_KEY` | non | idem |
| `VAPID_SUBJECT` | non | contact exigé par la spécification Web Push (`mailto:…`) |

Le push Android et le push Web Push sont **deux choses distinctes** :
Firebase pour les téléphones, VAPID pour les navigateurs. Les activer suppose
donc deux configurations séparées. La paire VAPID se génère localement, sans
compte ni console externe :

```bash
node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"
```

### 6.4 Application mobile

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
```

`10.0.2.2` est l'alias de la machine hôte depuis l'émulateur Android. Depuis un
téléphone physique, utiliser l'IP LAN du serveur. L'URL de l'API est injectée à
la compilation via `--dart-define` ; sans elle, l'application ne peut pas joindre
le backend.

---

## 7. Comptes de démonstration

Mot de passe `1234` pour tous (4 chiffres, haché en scrypt avec un sel, jamais en
clair).

| Rôle | Numéro | Espace |
| --- | --- | --- |
| Super administrateur | `2250909090909` | web — back-office de régie |
| Technicien | `2250102030405` | mobile `/tech/...` |
| Propriétaire de zone | `2250707070707` | mobile `/home/...` |

Les deux derniers se connectent dans l'application mobile. Le back-office web
refuse leur connexion (`lib/auth.ts`) : ces numéros n'y servent à rien.

L'OTP de démonstration (`123456`) reste accepté par l'API mobile
`POST /api/auth/login`, mais plus par l'écran web.

Le jeu de démonstration crée aussi un dossier client, une zone Wi-Fi validée avec
ses équipements, et trois demandes dans trois états différents (nouvelle,
affectée, terminée et payée).

### 7.1 Repartir d'une base vide

Quand la démonstration a servi, ou avant d'accueillir de vraies données :

```bash
npm run wipe:demo:dry     # compte ce qui partirait, n'écrit rien
npm run wipe:demo         # exécute
```

Le script (`prisma/wipe-demo.ts`) supprime les zones, dossiers client,
équipements, demandes, rapports, devis, paiements, avis, suivis, notifications
et diffusions, puis tous les comptes **sauf un super administrateur**.

Ce compte survit pour une raison précise : sans lui, plus personne ne peut se
connecter au back-office. La connexion par numéro crée un compte `CLIENT`, et
aucun écran ne permet de se promouvoir soi-même en administrateur. Vider la
base sans conserver d'administrateur verrouillerait la plateforme derrière sa
seule porte d'entrée.

Le numéro conservé est passé par `--keep`, et le script refuse de s'exécuter si
ce compte n'existe pas ou n'est pas `SUPER_ADMIN` — plutôt que de vider la base
en laissant personne pour la gérer. Sur une base Neon, préférer une branche à un
`pg_dump` pour pouvoir remonter le temps : les suppressions sont irréversibles.

Pour repartir d'une base vide puis rejouer la démonstration, enchaîner :

```bash
npm run wipe:demo && npx prisma db seed
```

---

## 8. Modèle de données

### 8.1 Entités

| Modèle | Rôle | Liens |
| --- | --- | --- |
| `User` | compte : téléphone unique, rôle, statut | `Client`, `Ticket`, `Evaluation`, `Notification` |
| `Client` | dossier d'un propriétaire de zone | `User?`, `WifiZone[]`, `Ticket[]` |
| `WifiZone` | une zone Wi-Fi et sa position | `Client`, `Equipment[]`, `Ticket[]` |
| `Equipment` | routeur, switch, ONT… d'une zone | `WifiZone` |
| `Ticket` | une demande d'intervention | `Client`, `WifiZone`, `User?` (technicien), `Intervention`, `QuoteInvoice`, `Evaluation`, `File[]`, `TechnicianTracking` |
| `Intervention` | rapport du technicien | `Ticket` (1-1) |
| `QuoteInvoice` / `InvoiceLine` / `Payment` | devis ou facture, lignes, règlement | `Ticket` (1-1) |
| `Evaluation` | avis d'un client, figeant le technicien évalué | `Ticket` (1-1), `User` |
| `TechnicianTracking` | position du technicien pendant le trajet, **une ligne par demande** | `Ticket` (1-1) |
| `Notification` / `PushToken` / `WebPushSubscription` | alertes et canaux | `User`, `Ticket?` |
| `Broadcast` | campagne de message, avec son état d'envoi | `User` |

### 8.2 Énumérations

| Enum | Valeurs |
| --- | --- |
| `Role` | `SUPER_ADMIN`, `TECHNICIAN`, `CLIENT` |
| `UserStatus` | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `ZoneStatus` | `PENDING`, `ACTIVE` |
| `Priority` | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| `TicketStatus` | `NEW`, `TO_VERIFY`, `ASSIGNED`, `CONFIRMED`, `EN_ROUTE`, `DIAGNOSING`, `PENDING_QUOTE`, `REPAIRING`, `COMPLETED`, `PENDING_PAYMENT`, `CLOSED`, `CANCELED` |
| `NotificationType` | `TICKET_SUBMITTED`, `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED`, `TICKET_CANCELED`, `QUOTE_SENT`, `QUOTE_ACCEPTED`, `QUOTE_REJECTED`, `PAYMENT_RECEIVED`, `EVALUATION_RECEIVED`, `ZONE_SUBMITTED`, `ZONE_VALIDATED`, `ZONE_DELETED`, `BROADCAST` |
| `BroadcastStatus` | `SCHEDULED`, `SENDING`, `SENT`, `CANCELLED`, `FAILED` |
| `DocumentType` / `DocumentStatus` | `QUOTE`/`INVOICE` ; `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `PAID` |
| `PaymentChannel` / `PaymentStatus` | `CASH`, `MOBILE_MONEY`, `BANK_TRANSFER` ; `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED` |
| `FileType` | `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT` |

### 8.3 Pourquoi des colonnes figées sur `Evaluation` et `TechnicianTracking`

L'`Evaluation` garde une référence au technicien ayant réalisé l'intervention,
**figée à la rédaction de l'avis**. Sans elle, la régie ne pourrait pas répondre
à « quel technicien est mal noté » sans parcourir toutes les interventions, et
une réaffectation ultérieure réécrirait le passé.

`TechnicianTracking` garde le technicien ayant envoyé la position, pour la même
raison : la demande peut depuis avoir été réaffectée, et l'ETA affichée au
client doit correspondre à la position qu'il voit.

---

## 9. API REST

### 9.1 Conventions

Toutes les réponses sont enveloppées : `{ "data": … }` ou `{ "error": "…" }`.
Les routes protégées attendent un en-tête `Authorization: Bearer <accessToken>`.
Un refus est motivé : le message dit **pourquoi**, pas seulement qu'il y a refus.

| Statut | Signification |
| --- | --- |
| `400` | saisie invalide — le message nomme le champ fautif |
| `401` | non authentifié, ou jeton invalide |
| `403` | authentifié mais pas autorisé — le message dit quelle règle s'applique |
| `404` | la ressource n'existe pas, **ou** n'est pas visible par ce compte |
| `409` | la règle métier l'interdit : devis non accepté, zone non validée, rapport déjà déposé, zone porteuse de demandes |

### 9.2 Authentification

| Méthode | Route | Accès | Effet |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | public | crée technicien ou propriétaire ; un propriétaire reçoit son dossier et sa première zone |
| `POST` | `/api/auth/login` | public | jeton d'accès (7 j) + jeton de refresh (30 j) |
| `POST` | `/api/auth/refresh` | refresh token | nouveau jeton d'accès |
| `POST` | `/api/auth/logout` | authentifié | révoque les jetons de push de l'appareil |
| `GET` | `/api/auth/me` | authentifié | compte, et dossier client + zones pour un propriétaire |
| `GET` | `/api/health` | public | état du service |

### 9.3 Demandes

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/tickets` | client (ses demandes) ou technicien (ses affectations) |
| `POST` | `/api/tickets` | client — refusée si la zone n'est pas validée ; affectation automatique |
| `GET` | `/api/tickets/:id` | le propriétaire concerné, le technicien affecté, ou la super administration |
| `PATCH` | `/api/tickets/:id/status` | technicien affecté ou super administration |
| `POST` | `/api/tickets/:id/intervention` | technicien affecté ou super administration |
| `PATCH` | `/api/tickets/:id/intervention` | technicien affecté ou super administration |
| `POST` | `/api/tickets/:id/files` | propriétaire ou technicien concerné |
| `POST` | `/api/tickets/:id/evaluation` | propriétaire de la demande |
| `POST` | `/api/tickets/:id/payment` | propriétaire de la demande |
| `POST` | `/api/tickets/:id/tracking` | technicien affecté — envoi de position |
| `GET` | `/api/tickets/:id/tracking` | propriétaire, technicien affecté ou super administration |
| `POST` | `/api/tickets/:id/tracking/stop` | technicien affecté |
| `POST` | `/api/tickets/:id/tracking/nudge` | propriétaire — relance le technicien |

### 9.4 Wi-Fi Zones et équipements

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/wifi-zones` | propriétaire (ses zones) ou super administrateur (tout le parc) ; un technicien reçoit `403` |
| `POST` | `/api/wifi-zones` | propriétaire — zone créée **en attente de validation** |
| `GET` | `/api/wifi-zones/:id` | son propriétaire ou la super administration |
| `PATCH` | `/api/wifi-zones/:id` | propriétaire (zone en attente seulement) ou super administrateur |
| `DELETE` | `/api/wifi-zones/:id` | super administrateur — **refusé** si la zone porte des demandes |
| `GET` | `/api/wifi-zones/:id/equipments` | propriétaire ou super administrateur |
| `POST` | `/api/wifi-zones/:id/equipments` | propriétaire ou super administrateur |
| `PATCH` | `/api/wifi-zones/:id/location` | propriétaire (sa position) ou super administrateur |

### 9.5 Factures, avis et portefeuille

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/quote-invoices` | propriétaire (ses factures) ou technicien (les siennes) |
| `POST` | `/api/quote-invoices` | technicien affecté |
| `GET` | `/api/quote-invoices/:id` | concerné ou super administration |
| `PATCH` | `/api/quote-invoices/:id/decision` | propriétaire — acceptation ou refus |
| `GET` | `/api/evaluations` | client (ses avis) ou technicien (les avis reçus) |
| `GET` | `/api/wallet` | technicien — ses seuls encaissements |

### 9.5.1 Annulation d'une demande payée

Le technicien annule une demande avec `PATCH /api/tickets/:id/status` et le
statut `CANCELED`. Si le client avait réglé, le paiement passe à `REFUNDED`
dans la même transaction, et la notification d'annulation dit au client que la
somme lui est restituée.

Le test porte sur `payment.status === 'COMPLETED'` et non sur l'existence du
paiement : une seconde annulation de la même demande enregistrerait sinon un
deuxième remboursement pour une somme déjà rendue.

Le devis reste `PAID` en base — le client a bien payé, un jour — mais l'écran
qui affiche son statut suit le paiement et dit « Remboursé ». Le `PaymentStatus`
`REFUNDED` existait dans le modèle depuis le début et ne recevait jamais cette
valeur.

### 9.6 Administration

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/clients` | super administrateur — annuaire paginé |
| `GET` | `/api/clients/:id` | super administrateur — dossier, zones, demandes |
| `GET` | `/api/admin/users` | super administrateur |
| `POST` | `/api/admin/users` | super administrateur — créer un compte |
| `PATCH` | `/api/admin/users/:id` | super administrateur — rôle, statut, mot de passe |

### 9.7 Notifications et campagnes

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/notifications` | authentifié — les siennes |
| `PATCH` | `/api/notifications` | authentifié — tout marquer comme lu |
| `PATCH` | `/api/notifications/:id` | authentifié — une notification |
| `GET` | `/api/notifications/stream` | authentifié — flux SSE |
| `POST` | `/api/push-tokens` | authentifié — déclare le jeton de l'appareil |
| `DELETE` | `/api/push-tokens` | authentifié — retire le jeton (déconnexion) |
| `GET` | `/api/cron/broadcasts` | secret d'en-tête `x-cron-secret` — envoie les campagnes dues |

---

## 10. Sécurité

### 10.1 Deux systèmes d'authentification, un seul backend

| Surface | Mécanisme | Implémentation |
| --- | --- | --- |
| Back-office web | session NextAuth (JWT) | pages et **server actions** |
| Application mobile | jeton Bearer maison | `src/lib/api-auth.ts` + `src/lib/auth-tokens.ts` |

Le web utilise sa session et passe par des server actions ; le mobile utilise le
Bearer et passe par des routes REST. **Les deux aboutissent aux mêmes fonctions
de `src/lib/`**, donc appliquent les mêmes règles. Aucune règle d'accès ne vit
dans une page ou dans une route.

### 10.2 Ce qui protège une donnée

| Couche | Rôle |
| --- | --- |
| Masquage dans l'interface | le confort : le bouton n'est pas proposé à quelqu'un qui ne peut pas le faire |
| **Garde serveur** | **l'autorité** : c'est elle qui protège, quel que soit le chemin d'appel |
| Règle métier dans `src/lib/` | la preuve : les deux surfaces appliquent la même |

Un rôle vérifié en amont d'un `throw` dans une page est une convention, pas une
protection : l'API est appelable directement.

### 10.3 Périmètres appliqués

| Ressource | Propriétaire | Technicien | Super admin |
| --- | --- | --- | --- |
| Demande — lire | ses demandes | ses affectations | toutes |
| Demande — écrire statut / rapport | **non** | ses affectations | toutes |
| Demande — affecter à un technicien | **non** | **non** | oui |
| Wi-Fi Zone — voir | les siennes | **aucune** | tout le parc |
| Wi-Fi Zone — déclarer / éditer | les siennes, en attente seulement | **non** | tout le parc |
| Wi-Fi Zone — valider / supprimer | **non** | **non** | oui |
| Dossier client | ses zones et demandes | **non** | tous |
| Portefeuille | **non** | ses encaissements | — |
| Avis | les siens | reçus, lecture seule | tous |

### 10.4 Protection des écritures

Un corps de requête n'est **jamais étalé** dans une écriture. Chaque champ est lu
explicitement et typé. Le rapport d'intervention partage sa table avec un `id` et
un `createdAt` : un étalement laisserait un appelant écrire l'identifiant d'un
autre rapport, ou une ligne qu'il n'a pas les droits de créer. Les longueurs de
texte et les plages numériques sont bornées côté serveur, l'application n'étant
pas la seule voie d'écriture.

La colonne `checklist` est relue à la sortie et filtrée : c'est une colonne `Json`,
donc rien n'y garantit la forme, et une ligne écrite avant ce durcissement peut
contenir n'importe quoi.

### 10.5 L'empreinte de mot de passe ne sort jamais

`passwordHash` est le seul champ de `User` qui ne doit jamais quitter le serveur :
l'empreinte est la moitié du secret d'un compte, et la renvoyer permettrait de la
casser hors ligne, à l'abri du contrôle de tentatives.

Toute inclusion d'un compte dans une réponse passe par
`PUBLIC_USER_SELECT` (`src/lib/user-public.ts`). Un `include: { technician: true }`
écrit à la main est presque toujours le même oubli : la relation est utile,
l'empreinte ne l'est jamais. Les six endpoints qui exposaient le compte du
technicien — détail d'une demande, liste des demandes, décision sur un devis,
dossier client — le font désormais par sélection explicite.

### 10.6 Ce qui n'est pas protégé, et pourquoi

| Point | Situation |
| --- | --- |
| `POST /api/auth/login` avec l'OTP de démonstration `123456` | un numéro inconnu se crée un compte `CLIENT` sans mot de passe. **À supprimer avant toute mise en production.** |
| Mot de passe de 4 chiffres | `PASSWORD_LENGTH` est défini dans `src/lib/roles.ts` pour que l'écran de connexion puisse guider la saisie. Un mot de passe long reste possible côté serveur ; seule la longueur d'interface est courte. |
| Pas de `middleware.ts` | les gardes sont dans les pages et les routes. C'est un choix : les règles sont dans `src/lib/`, un middleware les dupliquerait et les ferait diverger. |
| APK signé avec la clé de debug | installable, mais pas publiable sur Google Play tant qu'une keystore de release n'a pas été générée. |

---

## 11. Migrations de schéma

Le projet utilise `prisma db push` : le schéma est la référence, il n'y a pas de
dossier `prisma/migrations`.

### 11.1 Fusion du rôle `ADMIN` dans `SUPER_ADMIN`

Retirer une valeur d'un enum PostgreSQL échoue tant qu'une ligne la porte. La
migration se fait donc en deux temps, orchestrée par `prisma/merge-roles.ts` :

```bash
npx tsx prisma/merge-roles.ts    # 1. ADMIN → SUPER_ADMIN (avant le push)
npx prisma db push --accept-data-loss
npx prisma generate
```

Le compte concerné conserve l'accès à l'ensemble des écrans d'administration :
c'était la régie. Le compte de démonstration `2250505050505` a disparu du seed,
faute de second rôle d'administration à créer.

### 11.2 Zones déjà en service

`prisma/zone-status-defaults.ts` passe les zones existantes en `ACTIVE`. Le parc
déployé avant l'existence du contrôle de validation a été déclaré par ses
propriétaires, mais il est en service : le faire repasser par la validation
ferait apparaître des pans de l'activité comme s'ils venaient d'être ajoutés.

```bash
npx tsx prisma/zone-status-defaults.ts
```

---

## 12. Tests et qualité

```bash
# API et back-office
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint
npm run build

# Application mobile
cd mobile
flutter analyze              # doit rester à 0 problème
flutter test
```

L'application mobile dispose d'une vraie suite de tests (parcours client et
parcours technicien), avec un adaptateur HTTP simulé (`test/fake_api.dart`) qui
rejoue les réponses de l'API.

Le projet web n'a pas de runner de tests : les règles d'affectation, de
notification, de cycle de vie des zones et de contrôle d'accès ont été validées
**en direct contre la base**, par des scripts qui appellent les fonctions de
`src/lib/` et par des appels HTTP réels sur un serveur de développement. Les
données créées par ces vérifications sont supprimées derrière elles.

---

## 13. Architecture du code

### 13.1 Back-office et API

```
src/
  lib/                 règles métier — la source de vérité
    roles.ts             rôles, libellés, navigation, prédicats
    user-admin.ts        création et modification d'un compte
    zones.ts             cycle de vie des Wi-Fi Zones
    tickets.ts           création, affectation, droits sur une demande
    interventions.ts     rapport d'intervention
    notifications.ts     écriture des notifications, choix du technicien
    broadcast.ts         campagnes de messages
    auth.ts / api-auth.ts / auth-tokens.ts   les deux surfaces d'authentification
  app/
    page.tsx, zones/, tickets/, invoices/, profile/   écrans de la régie
    admin/utilisateurs/, admin/zones/, admin/avis/, admin/notifications/
    zones/actions.ts, tickets/actions.ts, ...          server actions
    api/                 API REST servie au mobile
mobile/lib/src/
  core/          thème, routeur, réseau (Dio), stockage chiffré, widgets
  features/<x>/
    data/          repositories — seule couche qui parle à l'API
    application/   providers et contrôleurs Riverpod
    presentation/  écrans et widgets
```

L'application mobile est **feature-first, en couches** : aucun écran n'appelle
`ApiClient` directement, et aucun appel réseau dans un `build()`. Deux espaces
séparés, dispatchés par rôle à la connexion : `/home/...` pour le client,
`/tech/...` pour le technicien. Ouvrir l'URL de l'espace de l'autre rôle depuis
un compte connecté redirige vers le sien.

Les détails de conception de l'application sont dans
[`mobile/AGENTS.md`](mobile/AGENTS.md). La palette, l'échelle d'espacement et
les ombres de référence sont dans
[`design-system/wifi-care-mobile/MASTER.md`](design-system/wifi-care-mobile/MASTER.md) —
attention, sa section « Écarts constatés » signale les points où le web et le
mobile ne suivent pas la même palette.

---

## 14. Construire et distribuer l'APK

```bash
cd mobile
tool/build_release.sh
# -> mobile/build/app/outputs/flutter-apk/WiFiCare-1.0.0.apk
```

Le script compile en release, vise la production et renomme la sortie. Pour
tester sur émulateur :

```bash
API_BASE_URL=http://10.0.2.2:3000/api tool/build_release.sh
```

### 14.1 Prérequis

La toolchain n'est pas détectée automatiquement : Flutter doit être dans le
`PATH`, et un JDK 17 ou plus doit l'être aussi. Le JBR d'Android Studio convient
et ne demande rien à installer :

```bash
export PATH="$HOME/development/flutter/bin:$PATH"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

`flutter doctor` signale `cmdline-tools component is missing` et des licences
non acceptées. Aucun des deux n'empêche `flutter build apk` tant que le SDK
Android, les platform-tools et les build-tools sont déjà installés sur la
machine. Ils bloqueraient en revanche `flutter doctor --android-licenses` et
l'ajout d'un nouveau composant au SDK.

### 14.2 Signature

La release est signée avec la **clé de debug**. L'APK qui en sort est
installable par `adb` ou par transfert direct, mais **le Play Store le
refusera**. Publier suppose de générer une keystore, de la déclarer dans
`mobile/android/key.properties` — fichier non versionné, comme la keystore — et
de remplacer `signingConfig = signingConfigs.getByName("debug")` dans
`mobile/android/app/build.gradle.kts`.

### 14.3 Notifications push

Hors configuration, l'application se compile et fonctionne : aucun téléphone
ne sonne. Le plugin Firebase n'est applique que si le fichier est present
(voir le commentaire en tete de `mobile/android/app/build.gradle.kts`) :

```bash
cp Firebase/google-services.json mobile/android/app/google-services.json
```

Ni `Firebase/` ni le fichier depose ne sont versionnes.

### 14.4 Pourquoi le renommage est fait en script

`flutter build apk` produit `app-release.apk`. Ce nom accompagne le fichier
jusqu'à la personne qui le reçoit, sur un téléphone comme dans une liste de
téléchargements, et n'identifie pas l'application. Le renommage se fait dans le
script parce qu'AGP 9 a retiré `outputFileName` de son API de variants : il
n'existe plus de moyen supporté de le faire depuis `build.gradle.kts`.

### 14.5 La marque est définie à trois endroits qui doivent rester alignés

| Emplacement | Valeur |
| --- | --- |
| `tool/build_release.sh` (`APP_NAME`) | `WiFiCare` |
| `android/app/src/main/AndroidManifest.xml` (`android:label`) | `WiFiCare` |
| `src/app/layout.tsx` (libellé du back-office) | `WiFiCare` |

### 14.6 La marque versionnée

| Emplacement | Usage |
| --- | --- |
| `public/logo-wificare.png` | barre latérale, écran de connexion |
| `src/app/icon.png` | favicon |
| `mobile/assets/logo/logo_wificare.png` | connexion et splash |
| `mobile/android/app/src/main/res/mipmap-*/ic_launcher.png` | icône du lanceur |
| `design-system/brand/logo-source.jpg` | image source, 736 × 736 |

Un changement de logo part de `design-system/brand/logo-source.jpg` et
remplace `public/logo-wificare.png` et `mobile/assets/logo/logo_wificare.png`,
tous deux en 512 × 512. L'icône Android doit être régénérée pour chaque
densité (`mdpi` 48 px → `xxxhdpi` 192 px).

> Le JPEG avait été retiré du dépôt au commit `4e4d7bc`, jugé référencé nulle
> part. Il revient ici avec un rôle — la source dont dérivent les PNG — mais
> **la correspondance visuelle n'a pas pu être vérifiée** : le JPEG fait
> 736 × 736, les PNG 512 × 512, et personne n'a encore comparé les deux. À
> confirmer avant d'en faire la référence.

### 14.7 Ce qui est versionné, et pourquoi

Le dépôt contient tout ce qui est nécessaire pour reconstruire l'APK à
l'identique :

- `mobile/pubspec.lock` — versions exactes des paquets Dart ;
- `mobile/android/gradle/wrapper/` — Gradle figé, **contre le modèle
  Flutter par défaut** : sans eux, un clone ne peut pas compiler tant que Gradle
  n'a pas été téléchargé à la main ;
- `package-lock.json` — versions exactes des dépendances Node.

Les caches et artefacts (`build/`, `.dart_tool/`, `android/.gradle/`,
`node_modules/`) sont exclus : ils se régénèrent avec `flutter pub get`,
`flutter build` et `npm install`. C'est aussi ce qui évite d'ajouter plusieurs
gigaoctets de fichiers générés au dépôt.

`android/local.properties` est exclu parce qu'il contient les chemins absolus du
SDK sur la machine du développeur ; `flutter build` le régénère. L'APK lui-même
n'est pas versionné : les releases GitHub fournissent le fichier prêt à installer.

---

## 15. Déploiement

Le back-office et l'API sont déployés ensemble (Vercel, `wificare-web`) ;
l'application est distribuée en APK.

Variables à définir dans l'environnement de production :

| Variable | Requise |
| --- | --- |
| `DATABASE_URL` | oui |
| `NEXTAUTH_SECRET` | oui |
| `NEXTAUTH_URL` | oui |
| `BROADCAST_CRON_SECRET` | oui, si l'envoi programmé est utilisé |
| `FIREBASE_SERVICE_ACCOUNT` | pour le push Android |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | pour le push Web Push |

Le déclencheur des campagnes est un appel planifié à `GET /api/cron/broadcasts`
portant l'en-tête `x-cron-secret: <BROADCAST_CRON_SECRET>`.

`src/lib/push.ts` se laisse tomber dans le silence sans configuration Firebase :
c'est volontaire, pour qu'une plateforme perde ses notifications push plutôt que
de refuser de démarrer. `/admin/notifications` affiche l'état du push pour que ce
silence ne passe pas pour un succès.

---

## 16. Décisions et choix de conception

| Décision | Raison |
| --- | --- |
| Un seul profil d'administration | `ADMIN` et `SUPER_ADMIN` n'avaient aucune différence de droits ; la frontière ne coûtait qu'à être maintenue |
| Affectation au technicien le moins chargé | l'affectation automatique devait continuer à fonctionner dès le deuxième technicien, sans revenir à une décision humaine par demande |
| Validation des zones avant exploitation | une zone déclarée par un particulier n'est pas un emplacement repris par la plateforme ; y envoyer un technicien serait promettre une prise en charge non décidée |
| Suppression définitive, refusée s'il y a des demandes | l'historique d'intervention est la seule trace de qui est intervenu, quand et pour quoi |
| Le propriétaire peut éditer sa zone **seulement** en attente | une fois validée, la fiche fait foi pour tous les autres |
| Les règles dans `src/lib/`, pas dans les écrans | le web et le mobile doivent rendre la même décision ; une règle dupliquée finit toujours par diverger |
| Les refus sont motivés dans leur message | un refus muet ne se distingue pas d'une panne, et la régie ne comprend pas pourquoi le bouton n'a rien fait |
| Les colonnes figées sur `Evaluation` et `TechnicianTracking` | une réaffectation ultérieure ne doit pas réécrire le passé |
| `checklist` en `Json` mais relue et filtrée à la sortie | une colonne `Json` ne garantit rien sur sa forme ; la lecture doit pouvoir faire confiance à ce qu'elle renvoie |
| Push sans configuration = silence, pas échec | une plateforme qui perd ses notifications vaut mieux qu'une plateforme qui refuse de démarrer |
| Le back-office n'a pas de version mobile | un compte d'administration n'a pas d'écran de terrain à faire ; l'application reste au client et au technicien |

---

## Stack

| Besoin | Technologie |
| --- | --- |
| API et back-office | Next.js 16 (App Router), React 19, TypeScript |
| ORM / base | Prisma 5, PostgreSQL (Neon) |
| Auth | NextAuth 4 (web), `jsonwebtoken` maison (mobile) |
| Notifications | FCM (Android), Web Push VAPID (navigateurs) |
| État / DI (mobile) | Riverpod |
| Navigation (mobile) | `go_router` |
| HTTP (mobile) | `dio` avec intercepteurs de jeton et refresh *single-flight* |
| Stockage (mobile) | `flutter_secure_storage` |
| Carte du trajet | `flutter_map` (OpenStreetMap, **sans clé API**) |
| Formatage | `intl` (fr-FR) |
| Styles du back-office | CSS maison dans `src/app/globals.css` |