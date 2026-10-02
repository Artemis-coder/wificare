# Journal de bord

Ce qui a changé dans le produit, et pourquoi. Les détails d'implémentation sont
dans l'historique git et le README ; ici, on retient ce qui est utile à savoir
six mois plus tard.

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
