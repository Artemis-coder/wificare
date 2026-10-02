import 'package:image_picker/image_picker.dart';

/// La règle de compression des photos, en un seul endroit.
///
/// Elle existe des deux côtés : l'application applique ce premier passage pour
/// ne pas envoyer cinq mégaoctets sur un réseau lent, et le serveur refait le
/// sien parce qu'un client n'est pas obligé de passer par l'application. Les
/// deux seuils sont volontairement identiques — c'est le même contrat, lu aux
/// deux extrémités, et non deux réglages qui divergent avec le temps.
///
/// | | côté client | côté serveur |
/// | --- | --- | --- |
/// | côté le plus long | 1 600 px | 1 600 px |
/// | qualité | 80 | 80 |
///
/// `image_picker` ré-encode avec le décodeur de la plateforme : ces valeurs ne
/// sont pas une garantie exacte, mais un ordre de grandeur fiable. C'est
/// précisément pourquoi le serveur ne lui fait pas confiance et recommpresse.
class PhotoPolicy {
  const PhotoPolicy._();

  /// Longueur maximale du côté le plus grand.
  static const double maxEdge = 1600;

  /// Qualité d'encodage, sur 100.
  static const int quality = 80;

  /// Nombre de photos attachables à une demande.
  ///
  /// Au-delà, une demande cesse d'être décrite et commence à être un album :
  /// le technicien n'a pas le temps d'en regarder vingt, et le risque pour le
  /// stockage augmente d'autant. Six suffisent à montrer un boîtier, un câble
  /// et un compteur.
  static const int maxPhotos = 6;

  /// Prend ou sélectionne une photo déjà réduite.
  ///
  /// `maxHeight` est posé en plus de `maxWidth` : sans lui, une photo prise en
  /// portrait garde sa grande hauteur, et le fichier reste lourd.
  static Future<XFile?> pick(ImageSource source) {
    return ImagePicker().pickImage(
      source: source,
      imageQuality: quality,
      maxWidth: maxEdge,
      maxHeight: maxEdge,
    );
  }
}