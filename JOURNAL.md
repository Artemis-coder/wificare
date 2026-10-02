# Journal de bord

Ce qui a changé dans le produit, et pourquoi. Les détails d'implémentation sont
dans l'historique git et le README ; ici, on retient ce qui est utile à savoir
six mois plus tard.

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
