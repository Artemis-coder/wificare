# Journal de bord

Ce qui a changé dans le produit, et pourquoi. Les détails d'implémentation sont
dans l'historique git et le README ; ici, on retient ce qui est utile à savoir
six mois plus tard.

## 1.4.3 — 3 octobre 2026

La régie voit enfin **où l'application est utilisée**.

### Ajouté

**Une couverture géographique sur le tableau de bord**, entre les indicateurs et
les actions rapides : les trois principaux pays, leur part en pourcentage des
comptes, leurs connexions, et un menu qui déplie le pays par pays derrière.

Trois pays, et non la liste entière. Un tableau de bord se lit en quelques
secondes ; vingt lignes de pays l'allongent sans rien apprendre de plus à celui
qui regarde. Le reste n'est pas perdu — il est regroupé sur une ligne « autres
pays » qui nomme trois de ses membres et porte le total exact.

**Le pays d'un compte est désormais une donnée.** Il ne l'était pas : le
sélecteur de pays des écrans de connexion et d'inscription ne faisait que
choisir le plan de numérotation du numéro, sans rien écrire. Le pays restait
porté par le seul indicatif, exact mais illisible depuis une requête — on ne
pouvait pas répartir les comptes par pays sans tous les ramener en mémoire. La
colonne `User.country` comble le manque, et **l'application mobile n'a pas eu à
changer** : le serveur déduit le pays du numéro qu'elle envoie déjà, ce qui
rattrape au passage les comptes enregistrés avant le sélecteur.

**Les connexions sont comptées** (`User.loginCount`, `User.lastLoginAt`). Elles
ne l'étaient pas : rien ne distinguait un compte jamais connecté d'un compte
inactif. Les deux chemins d'authentification écrivent — l'API mobile comme le
back-office NextAuth — parce qu'un technicien qui travaille depuis l'application
et un administrateur qui travaille depuis le web sont deux usages du même
produit. L'écriture n'est jamais attendue et n'échoue jamais vers l'utilisateur :
une mesure d'activité ratée doit coûter une ligne de journal, pas une connexion
refusée à quelqu'un dont le mot de passe est le bon.

### À retenir

**Les compteurs de connexion partent de zéro, et c'est dit à l'écran.** Les
sessions antérieures au suivi ne sont pas reconstituables : afficher le nombre
dexact serait faux, et afficher « inconnu » le ferait passer pour un défaut. Le
tableau de bord affiche 0 et porte la mention « depuis le suivi ».

**Un pays ne se réécrit pas à la connexion.** Il est écrit une fois, à
l'inscription, puis complété seulement s'il manque. Un compte qui voyage garde
son pays d'inscription : l'indicatif d'un numéro ne dit que l'indicatif utilisé
pour le joindre, pas d'où l'on utilise l'application.

**Le regroupement se fait en base**, par `groupBy`. Ramener tous les comptes en
mémoire pour les compter ferait grossir la requête au rythme de la plateforme,
alors que c'est précisément la taille qui est mesurée. L'index sur `User.country`
existe pour la même raison.

**`knownCountry` et `countryByCode` ne font pas la même chose.** La seconde
renvoie le pays par défaut pour un code inconnu, ce qui est le bon comportement
pour valider une saisie et le mauvais pour afficher une colonne : un code absent
des données deviendrait silencieusement « Côte d'Ivoire ». La première renvoie
`null`, et l'écran affiche un pays non renseigné plutôt qu'un drapeau faux.

Les comptes déjà enregistrés se rattachent avec `npm run countries:backfill`,
qui relit le plan de numérotation de chaque numéro. Il est sans danger à rejouer
— seuls les comptes sans pays sont touchés — et n'écrit rien sans `--yes`.

## 1.4.2 — 2 octobre 2026

PostHog arrive dans le back-office, en trois volets.

### Ajouté

**Analytics, suivi des erreurs, et la préparation pour l'observabilité
LLM.** La régie ne sait plus ce qui se passe sur son propre outil :
quel compte s'est connecté, quelle zone a été validée, quelle
demande a été créée, quelle action a échoué. Les événements métier
sont tracés côté navigateur (pageviews, clics) et côté serveur
(server actions), et les exceptions — serveur et rendu — remontent
avec leur pile complète et le contexte de la requête.

Ce qui est tracé est **délibérément pauvre** : des noms de champs et
des identifiants, jamais de valeurs. Aucun numéro de téléphone, aucun
mot de passe, aucune description de demande, aucun nom de client ne
quitte le back-office pour PostHog. Une pile d'exception peut en
contenir, ce qui est un argument de plus pour ne jamais y mettre de
donnée personnelle.

**Le replay de session est désactivé par défaut**, et son activation
ne se fait pas par une variable d'environnement seule : filmer les
écrans de la régie suppose d'abord de masquer le texte sensible
sélectivement. Masquer toute la page ne laisserait qu'un replay de
boutons vides ; tout filmer enverrait les dossiers clients à un
service tiers.

**AI Observability est installé mais inactif.** Aucun appel LLM n'existe
dans le code. Le helper qui rapportera une génération est là, pour que
le jour où le back-office appellera un modèle, la trace soit déjà
routable plutôt que reconstruite après coup.

### Corrigé

**Un envoi de source maps raté ne fait plus échouer le build.** Une clé
personnelle sans les bons scopes, un quota dépassé ou une coupure
réseau interrompaient le déploiement d'une application par ailleurs
correctement construite. Le build continue désormais, les cartes sont
supprimées du dossier servi — un `.map` publié expose le code source —
et l'avertissement dit quelles clés manquent.

**La déconnexion réinitialise l'identité PostHog.** Sans `reset()`, le
compte suivant sur un même poste de régie héritait de l'identité du
précédent : ses actions étaient rattachées à un compte qui n'était
plus le sien.

### À faire

**Exception autocapture** doit être activé une fois dans l'interface
PostHog (Settings → Error tracking → Configuration). Le SDK web lit la
config distante du projet, qui désactive la capture des erreurs non
gérées du navigateur par défaut. Les exceptions serveur, elles, sont
déjà capturées. Les source maps, elles, exigent une clé personnelle
portant les scopes `error_tracking:read` et `error_tracking:write`,
à déclarer sur Vercel pour que le build de production les envoie.

## 1.4.1 — 2 octobre 2026

Le back-office se consulte au téléphone, mais il n'avait pas été conçu pour.

### Corrigé

**Le back-office n'était lisible qu'assis devant un écran.** 260 px de navigation
fixe, des grilles calibrées pour 1 100 px de large, des tableaux de sept colonnes
et des champs qui refusaient de rétrécir. Rien n'était cassé : c'était la version
bureau, affichée sur un téléphone. La régie, elle, vérifie une intervention
depuis le parc.

La navigation devient un tiroir sous 768 px. Il se referme au voile, à la touche
Échap et en changeant de page — cette dernière fermeture n'est pas un effet mais
un état : le tiroir retient la route sur laquelle il a été ouvert, donc il se
referme seul quand la route change, sans rendu intermédiaire où il resterait
ouvert par-dessus l'écran venu d'ouvrir.

**Les tableaux sont devenus illisibles avant d'être interdits.** Un tableau de
sept colonnes sur 375 px ne se réduit pas : il devient **une carte par ligne**,
chaque cellule portant son intitulé dans `data-label`. La même information, mais
empilée au lieu d'être répartie sur une largeur impossible.

**Les indicateurs sont deux par rangée, et le dernier pleine largeur quand ils
sont en nombre impair.** Cinq cartes donnaient une demi-rangée vide en bas d'un
écran de téléphone. La grille le fait seule, et le résultat tient sur une règle :
un tableau à deux colonnes ne s'étire pas pour remplir le vide, un tableau à
trois non plus.

**Aucune mise en page ne tient dans un style inline** — non par principe, mais
parce qu'un style inline ne peut pas être surchargé par un media query. La
première version du correctif en comptait un très grand nombre, qu'il a fallu
déloger un par un.

**La modale de création de compte n'avait qu'une sortie**, le bouton « Annuler »
en bas d'un formulaire qui peut déborder sur téléphone. Elle se ferme désormais
à la touche Échap et rend le focus au bouton qui l'a ouverte.

**Le panneau de notifications sortait de l'écran.** Il était calé sur la cloche,
qui n'est pas au bord de l'écran : l'avatar du compte est à sa droite.

**Six classes CSS étaient consommées sans être déclarées** — `.stat-card`,
`.badge-error`, `.btn-sm`, `.search-bar`, `.user-profile`, et `--bg-card`, qui
rendait les tuiles de diffusion transparentes faute d'avoir été déclarée.
`globals.css` est le seul endroit où l'on déclare : un composant qui a besoin
d'une classe la réclame là, il ne l'invente pas dans son rendu.

### Ce qui vaut d'être retenu

Un test de débordement se trompe si l'on se contente de comparer
`documentElement.scrollWidth` à `clientWidth` : dès qu'un `overflow-x: hidden`
s'interpose, le premier dépasse le second alors que la page ne bouge pas au
doigt. La méthode retenue est de mesurer le débordement sur chaque largeur, puis
de vérifier qu'il est **atteignable** — le tableau trop large défile dans son
propre conteneur, la page, elle, ne bouge pas.


## 1.4.0 — 2 octobre 2026

Une carte invisible, des photos illisibles en grand, une base qui grossit, des
notifications qu'on ne peut pas effacer, et une clôture qui ne dit rien de ce qui
a été fait.

### Corrigé

**La carte ne s'affichait plus chez la régie.** Deux défauts distincts. Leaflet
était importé dynamiquement — il manipule `window`, il ne peut pas l'être au
rendu serveur — et React rejoue les effets en développement : la carte était
donc construite deux fois sur le même conteneur, ce que Leaflet refuse
explicitement. Par ailleurs, ses marqueurs par défaut chargent leurs images depuis
une URL calculée sur sa feuille de style ; sous un empaqueteur elle pointait sur
l'URL de la page, et chaque marqueur demandait `/tickets/marker-icon.png`. Les
marqueurs sont désormais dessinés en HTML, sans fichier à charger.

Côté application mobile en revanche, la carte n'était pas cassée : elle n'a rien
à afficher. Elle est liée au déplacement, et les demandes de la base sont closes
ou annulées, tous les suivis arrêtés. Une carte figée après coup ferait croire
que le technicien est encore en chemin.

**Les photos du client s'affichaient, mais sans que rien ne puisse en être fait.**
Le technicien les voyait en vignettes de 88 pixels, sans pouvoir les ouvrir —
alors que c'est précisément à cette taille qu'on ne peut pas juger d'un boîtier
mal branché. Elles s'ouvrent maintenant en grand, avec zoom. Les pièces non
images ne sont plus passées dans la visionneuse d'images, où elles ne donnaient
qu'une icône cassée : une vidéo ou un document est nommé comme tel.

**Les photos Occupaient la base sans raison.** Elles arrivaient telles quelles :
une image de téléphone de 4 000 × 3 000 pesait plusieurs mégaoctets pour une
scène qui n'occupe qu'un écran. `lib/images` porte désormais la règle, et elle
n'existe qu'à un endroit : 1 600 px et qualité 80, appliqués **des deux côtés**.
Le client évite d'envoyer cinq mégaoctets sur un réseau lent ; le serveur
recommpresse parce qu'un client n'est pas obligé de passer par l'application. Un
contrôle qui n'existe que d'un côté n'est pas un contrôle. Mesuré : **34 Mo
ramenés à 643 Ko, 98 % de réduction**.

Trois décisions méritent d'être dites. La sortie est en JPEG, format que sait
décoder partout ; l'original n'est gardé que si la compression le ferait
grossir, ce qui arrive sur une capture d'écran faite d'aplats. L'orientation
EXIF est appliquée, sans quoi une photo prise en paysage s'affiche tournée — et
le réencodage retire au passage les coordonnées du domicile du client. Enfin une
image illisible n'est pas rejetée : une photo qui n'aboutit pas à l'écran ne
doit pas empêcher de signaler sa panne.

**`public/uploads/` n'était pas ignoré.** Des photos de clients seraient parties
dans le premier `git add .`, puis jamais effacées. Le dossier est maintenant
versionné vide, et son contenu ignoré.

**Une notification lue ne pouvait pas s'effacer.** Elle prenait la place, sans
que l'utilisateur puisse faire le ménage. Le balayage la supprime, après
confirmation. Une notification **non** lue ne se supprime pas : elle porte un fait
que l'utilisateur n'a pas encore vu, et le compteur de non-lus n'aurait plus
rien à signaler. Le serveur refuse aussi, par `409` — l'écran rend le geste
impossible, le serveur empêche qu'on passe outre.

**Clôturer ne demandait aucun rapport.** Le champ existait, le serveur l'écrivait,
l'écran l'affichait — et rien ne le remplissait jamais. Une demande close ne
laissait aucune trace écrite de ce qui avait été fait dans l'installation du
client. Le rapport est désormais demandé **avant** la transition : une fois la
demande close, le technicien n'a plus à quel écran revenir, et rien ne le lui
rappellerait. Diagnostic et interventions réalisés sont tous deux exigés : le
premier dit ce qui a été constaté, le second ce qui a été fait.

## 1.3.0 — 2 octobre 2026

Trois manques de la même famille : ce que l'utilisateur a accordé, ce qu'il voit,
et ce qu'il peut faire, n'était pas à jour.

### Corrigé

**La localisation n'était demandée qu'au premier plan.** Le manifeste déclarait
`ACCESS_BACKGROUND_LOCATION` depuis le début, mais le code ne demandait jamais
que le premier niveau : `ACCESS_FINE_LOCATION`. Le technicien partageait donc sa
position écran allumé, et perdait le suivi dès que le téléphone se verrouillait —
c'est-à-dire pendant tout le trajet, puisque le téléphone est en poche. Le client
de son côté voyait l'ETA se figer sans explication, et le technicien ne pouvait
rien y faire.

Android traite ces deux niveaux comme deux demandes distinctes : les réclamer
d'un bloc est ignoré. L'application demande donc le premier plan, puis revient
demander l'arrière-plan une fois le premier accordé — c'est ce second appel qui
ouvre la fenêtre « Autoriser tout le temps ». Un refus de ce second niveau n'est
pas un échec : l'application garde le premier plan et **dit** que la position ne
sera pas partagée écran éteint. Le silence, lui, aurait laissé le technicien
croire partager sa position pendant tout le trajet.

**Une demande assignée n'apparaissait qu'après un rechargement manuel.** Le
technicien chargeait sa liste, la régie affectait une demande trente secondes
plus tard, et rien ne l'informait de l'événement le plus important de sa journée.
Il fallait actualiser à la main, sans savoir s'il l'avait déjà fait.

La correction n'est pas un minuteur. Le serveur écrit déjà une notification à
chaque changement d'état, et elle arrive par le flux temps réel : **c'est elle
qui est l'événement**. La liste se relit donc quand le serveur dit qu'elle a
changé, pour le ticket concerné et lui seul — recharger toute la liste à chaque
notification ferait clignoter le contenu et perdre la position de défilement
pour une demande qui n'a pas bougé. Aucun sondage, aucune fenêtre pendant
laquelle l'écran ment.

**Le bouton « Envoyer un devis » restait affiché sur un devis validé.** Un devis
accepté ou payé est entré en vigueur ; en réécrire un ne ferait que le
contredire, et la décision du client se porterait alors sur un document qui n'est
plus celui qu'il lisait. Le bouton ne s'affiche plus que lorsqu'aucun devis
n'existe, ou après un refus — seul cas où il en reste un à écrire. Après un refus
il se nomme d'ailleurs « Proposer un nouveau devis », ce qu'il est.

### Note

La localisation en arrière-plan n'est demandée qu'au **technicien**. Côté client,
l'application ne fait qu'un relevé ponctuel pour géolocaliser une zone : lui
demander « tout le temps » lui promettrait une surveillance qu'aucune fonction
n'exploite, et Google Play refuse la localisation en arrière-plan accessoire. La
demande est donc paramétrée, et le relevé client la pose sans.

## 1.2.0 — 2 octobre 2026

Ce que la régie et les techniciens ne pouvaient pas faire malgré toute la
logique déjà en place : décider d'un devis depuis la panne, encaisser en
espèces, et voir où se trouve un technicien.

### Corrigé

**Le client ne pouvait trancher son devis que depuis l'onglet « Factures ».**
Le devis arrivait bien dans le détail de la panne — l'API le renvoyait, le
modèle le portait — mais l'écran n'affichait qu'un type, une pastille et un
montant. Ni les lignes, ni les notes, et surtout aucun moyen de répondre : le
client devait retrouver la facture dans un autre onglet pour autoriser un devis
qui concernait la panne qu'il était en train de lire. Le détail porte désormais
le devis complet et les deux décisions, avec le même dépôt, la même confirmation
avant un refus et les mêmes invalidations que l'onglet « Factures ».

**Un encaissement en espèces n'existait nulle part.** Seul le client pouvait
appeler l'API de paiement. Or un règlement en espèces n'a pas d'auteur déclaré :
le technicien tient les billets, et le client peut être absent. Ce paiement
n'entrait donc ni dans le relevé du technicien, ni dans la facturation de la
régie — le montant encaissé n'était traçable par personne. Le technicien
déclare désormais ce qu'il a encaissé, sur la demande qui lui est affectée.
Le montant n'est pas transmis : c'est celui du devis accepté, parce qu'un
montant saisi à la main permettrait de présenter un encaissement partiel comme un
règlement complet. Il ne déclare que du cash — lui laisser déclarer un Mobile
Money reviendrait à lui permettre d'afficher un règlement que le client nie
avoir fait.

**Un remboursement disparaissait du relevé.** Le total se recalculait sur les
seuls règlements effectifs, et l'historique sur les mêmes lignes : une somme
encaissée puis reprise s'évaporait, et le technicien lisait son relevé comme
faux. Les remboursements figurent maintenant dans l'historique, marqués comme
tels, et une ligne « dont X remboursés » explique l'écart entre le cumul et la
somme des montants affichés — sans entrer dans le cumul lui-même, qui est un
encaissement et non une recette.

**Le portefeuille ne se rafraîchissait jamais.** Le total était mis en cache
pour toute la session : le technicien encaissait, ouvrait son portefeuille, et
voyait les chiffres d'avant. Le relevé se relit à l'ouverture. Aucun minuteur
ne tourne en fond, et surtout pas pendant qu'il consulte — un relevé qui bouge
sous les yeux est illisible.

**La liste des pannes ignorait la panne qui venait d'être créée.** Le retour
de l'onglet conservait la liste déjà chargée : le client se retrouvait devant
une liste sans sa demande, et ses compteurs du tableau de bord non plus,
jusqu'à ce qu'il tire l'écran pour actualiser. L'invalidation porte sur toute
la famille de filtres, pas sur le seul filtre affiché — l'écran actif reste
vivant, et un onglet monté conservait sinon sa liste d'avant.

**La régie ne voyait pas où se trouve le technicien.** Le suivi était lu, mais
seuls le nom, l'ETA et la distance étaient affichés — trois chiffres qui ne se
situent pas. La page de la demande porte maintenant la position sur une carte,
avec le technicien et la zone du client, plus les coordonnées, la précision et
la vitesse. Les tuiles viennent d'OpenStreetMap, comme dans l'application
mobile : pas de clé API. La carte reste un instantané à l'ouverture de la page ;
un rafraîchissement automatique la ferait sauter sous le curseur de la régie en
pleine lecture.

### Note

Le paiement du technicien et celui du client passent par deux routes
distinctes. Les confondre sous un même point d'entrée obligerait chaque
appelant à vérifier s'il a le droit d'écrire ce qu'il envoie, et la règle
serait dupliquée côté client.

## 1.1.0 — 2 octobre 2026

Première version qui regroupe les correctifs signalés à l'usage. Le parcours
complet d'une intervention, du devis au paiement, a été vérifié de bout en
bout.

### Corrigé

**Le technicien ne pouvait plus avancer après un paiement.** Le client
acceptait le devis, puis le réglait ; la demande restait en « devis en attente »
avec un devis payé. Le garde-fou exigeait un devis *accepté* pour passer en
réparation, et l'écran posait la même condition — le bouton disparaissait, et
l'API répondait `409`. Aucun recours. Un devis payé autorise la réparation plus
encore qu'un devis accepté : c'est le même accord, déjà honoré en argent. La
règle le reconnaît désormais, et l'acceptation déplace la demande au lieu de la
laisser en attente d'un statut interdit.

**Une demande annulée gardait l'argent du client.** Le technicien annulait, et
rien ne disait que la somme avait été rendue. Le statut `REFUNDED` existait
dans le modèle depuis le début sans jamais recevoir cette valeur. La
restitution suit désormais l'annulation, et l'application affiche «
Remboursé » plutôt qu'un « Payé » au-dessus d'une somme disparue.

**Le client n'avait aucun retour après un refus de localisation.** Android ne
ferme la boîte de dialogue définitivement qu'au second refus ; ensuite, seul
l'accès aux réglages fonctionne. Ce bouton existait chez le technicien, pas
chez le client. Il est ajouté, et l'écran distingue désormais les deux refus.

**Le devis ne pouvait pas être vu ni tranché depuis le web.** L'API le
permettait depuis le début, mais aucun écran ne l'appelait : un client
connecté à un navigateur lisait un devis en attente, son montant, ses lignes,
et ne pouvait ni accepter, ni refuser, ni régler.

### Changé

**Le back-office est réservé à la régie.** Client et technicien sont refusés à
la connexion web, avec un message qui renvoie vers l'application. Avant, ils
y voyaient les demandes, les zones et les montants de tous les autres, et un
tableau de bord qui agrégeait la plateforme entière — des compteurs sans usage
pour eux. Le devis se lit côté régie, il ne se tranche plus.

**Les listes du back-office sont bornées.** `/invoices`, `/tickets` et
`/tickets/[id]` lisaient la plateforme entière ; l'API bornait déjà ses listes,
les écrans non.

**La pastille de statut ne confond plus les états.** Un devis en attente de
décision, accepté et refusé s'affichaient tous comme « en attente ».

**L'application est en `1.1.0+2`.** Android refuse d'installer par-dessus une
application dont le `versionCode` n'a pas augmenté : le numéro de version suit
chaque changement livré, pas chaque compilation.

## 1.0.0 — 1er octobre 2026

Version initiale distribuable. Elle contient l'application Flutter, le
back-office Next.js et le premier cycle devis → paiement, mais **ne doit plus
être distribuée** : elle contient l'impasse de la réparation décrite ci-dessus.

Ce qui manquait à cette version :

- aucune restitution quand le technicien annulait une demande payée ;
- la carte de la position du client n'offrait aucun recours après un refus ;
- les listes du back-office n'étaient pas bornées ;
- le devis n'était pas jouable depuis le web.

## Origine — 30 septembre 2026

Le dépôt démarre d'un gabarit Next.js, puis la base est reconstruite : schéma
Prisma, authentification, rôles, API REST. Le back-office et l'application
Flutter arrivent le 1er octobre, avec les zones à valider, les rapports
d'intervention verrouillés et la fusion des rôles d'administration en un seul
profil de régie.
