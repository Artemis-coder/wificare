import sharp from "sharp";

/**
 * Compression des images déposées sur une demande.
 *
 * Les photos d'une panne viennent d'un téléphone : plusieurs mégaoctets
 * chacune, pour une scène qui n'occupe qu'un écran. Le disque comme la base
 * accumulent alors des octets que personne ne verra jamais, et l'attente est
 * d'autant plus longue que le technicien parcourt la ville avec une connexion
 * qui peine déjà à suivre sa position. Compresser à l'entrée règle les deux.
 *
 * **La règle** — une seule, appliquée des deux côtés :
 *
 * | | côté client | côté serveur |
 * | --- | --- | --- |
 * | côté le plus long | 1 600 px | 1 600 px |
 * | qualité | 80 | 80 |
 * | format | inchangé | JPEG |
 *
 * Le client fait un premier passage pour ne pas envoyer cinq mégaoctets sur un
 * réseau lent ; le serveur refait le sien parce qu'un client n'est pas obligé de
 * passer par l'application — un import, un script, un autre poste. Un contrôle
 * qui n'existe que d'un côté n'est pas un contrôle.
 *
 * La sortie est un **JPEG** : c'est le format que sait décoder partout, et il
 * perd moins sur une photo de panne qu'un PNG. L'original est conservé quand la
 * compression produirait un fichier **plus gros** — ce qui arrive sur une
 * capture d'écran faite d'aplats, où le JPEG dégrade pour rien.
 *
 * Une image que `sharp` ne sait pas lire n'est pas rejetée : elle est stockée
 * telle quelle. Une photo de panne qui n'aboutit pas à l'écran ne doit pas
 * empêcher le client de signaler sa panne.
 */

/** Longueur maximale du côté le plus grand, en pixels. */
export const MAX_EDGE = 1600;

/** Qualité JPEG de sortie, sur 100. */
export const QUALITY = 80;

/** En deçà de cette taille, recompresser coûterait plus qu'il ne rapporte. */
const MIN_BYTES = 24 * 1024;

export type StoredImage = {
  buffer: Buffer;
  /** Extension du fichier à écrire, extension d'origine comprise. */
  extension: string;
  /** Faux si l'image a été conservée telle quelle. */
  compressed: boolean;
};

/**
 * Réduit une image et l'encode en JPEG.
 *
 * Ne lève pas : retourne `compressed: false` si l'image ne peut pas être lue,
 * afin que l'appelant décide. Rejeter une pièce jointe pour un problème de
 * codec laisserait le client sans preuve de sa panne.
 */
export async function compressImage(
  input: Buffer,
  originalExtension: string
): Promise<StoredImage> {
  try {
    // `rotate()` sans argument applique l'orientation EXIF. Sans lui, une photo
    // prise en paysage s'affiche tournée : le technicien verrait le boîtier du
    // routeur à l'envers.
    const jpeg = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: QUALITY,
        // Réencoder retire les métadonnées EXIF, dont les coordonnées du
        // domicile du client. Une photo de panne n'a aucun besoin de les
        // publier.
      })
      .toBuffer();

    // Un encodage plus lourd que l'original est un échec : garder l'original
    // plutôt que dégrader une image pour gagner des octets au prix de sa
    // lisibilité.
    if (jpeg.length >= input.length) {
      return {
        buffer: input,
        extension: originalExtension || "jpg",
        compressed: false,
      };
    }

    return { buffer: jpeg, extension: "jpg", compressed: true };
  } catch {
    return {
      buffer: input,
      extension: originalExtension || "bin",
      compressed: false,
    };
  }
}

/** Le contenu vaut-il la peine d'être compressé ? */
export function shouldCompress(byteLength: number): boolean {
  return byteLength > MIN_BYTES;
}