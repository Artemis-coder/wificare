/// Plan de numérotation d'un pays.
///
/// Les données de tous les pays sont générées par
/// `scripts/generate-phone-countries.ts` (`npm run phones:generate`), qui les
/// lit dans les métadonnées de numérotation publiées. Ce fichier ne décrit que
/// la forme d'une entrée, il n'en contient aucune.
class PhoneCountryData {
  const PhoneCountryData({
    required this.code,
    required this.name,
    required this.dial,
    required this.trunk,
    required this.lengths,
    required this.prefixes,
    required this.example,
  });

  /// ISO 3166-1 alpha-2, « CI ».
  final String code;

  /// Nom du pays en français, « Côte d'Ivoire ».
  final String name;

  /// Indicatif pays sans « + », « 225 ».
  final String dial;

  /// Préfixe national écrit devant le numéro par les abonnés du pays — « 0 » en
  /// France, absent en Côte d'Ivoire où le zéro fait partie du numéro. Vide
  /// quand le pays n'en déclare pas.
  final String trunk;

  /// Longueurs admises pour un numéro national, indicatif et préfixe exclus.
  final List<int> lengths;

  /// Préfixes mobiles du pays ; vide quand le plan en publie trop pour être
  /// utile.
  ///
  /// Ils ne servent qu'à la vérification stricte, jamais à un avertissement :
  /// un plan classe certains numéros valides hors de ses plages mobiles — le
  /// `09` ivoirien des comptes de démonstration en est un — et annoncer à
  /// l'utilisateur que son propre numéro est suspect serait faux.
  final List<String> prefixes;

  /// Numéro national d'exemple, écrit comme l'utilisateur l'écrira.
  final String example;

  /// Drapeau du pays, 🇨🇮.
  ///
  /// Le drapeau est un couple de points de code Unicode : « CI » devient
  /// U+1F1E8 U+1F1EE. Le calculer évite d'en porter 245 dans les données
  /// générées, qui ne changent que lorsque les métadonnées changent.
  String get flag {
    final letters = code.toUpperCase();
    if (letters.length != 2) return '🏳';

    return String.fromCharCodes(
      letters.codeUnits.map((unit) => 0x1F1E6 + unit - 0x41),
    );
  }

  /// Indicatif affiché, « +225 ».
  String get dialLabel => '+$dial';

  /// Longueur maximale qu'une saisie peut atteindre, préfixe national compris.
  ///
  /// Un champ qui autorise plus de chiffres n'a pas de borne à dessiner, et un
  /// champ qui en autorise moins empêche de taper un numéro valide.
  int get maxDigits =>
      lengths.reduce((first, second) => first > second ? first : second) +
      trunk.length;

  /// Nombre de chiffres national, en toutes lettres : « 10 chiffres ».
  String get digitsLabel => lengths
      .map((count) => count == 1 ? '1 chiffre' : '$count chiffres')
      .join(' ou ');
}