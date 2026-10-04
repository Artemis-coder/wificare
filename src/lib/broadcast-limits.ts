/**
 * Longueurs acceptées pour un message de la régie, calées sur ce qu'un téléphone
 * sait afficher.
 *
 * Elles vivent à part de `lib/broadcast` parce que l'interface en a besoin pour
 * compter les caractères et annoncer une troncature, alors que `lib/broadcast`
 * tire Prisma et les notifications : l'importer depuis un composant client y
 * embarquerait le serveur. Un module sans dépendance, importable des deux côtés.
 */

export const TITLE_MAX = 80;
export const BODY_MAX = 240;