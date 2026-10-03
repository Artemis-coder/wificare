import 'phone_countries.generated.dart';
import 'phone_country_data.dart';

/// Raison pour laquelle un numéro est refusé.
enum PhoneProblem {
  /// Rien n'a été tapé.
  empty,

  /// Le nombre de chiffres n'est pas celui du pays choisi.
  length,

  /// Le numéro ne commence pas par un préfixe mobile du pays.
  prefix,
}

/// Résultat d'une vérification de numéro.
///
/// Les deux issues sont dans le même objet parce que l'écran doit décider de la
/// même façon dans les deux cas : afficher un message sous le champ, ou envoyer
/// le numéro au serveur. Les separatiser obligerait le widget à tester deux
/// résultats possibles à chaque appel.
class PhoneValidation {
  const PhoneValidation.accepted(this.digits, this.e164)
    : problem = null,
      message = null;

  const PhoneValidation.rejected(this.problem, this.message)
    : digits = '',
      e164 = '';

  /// Chiffres nationaux retenus, préfixe national retiré s'il était là.
  final String digits;

  /// Numéro international, « +2250707070707 ».
  final String e164;

  /// Raison du refus, `null` quand le numéro est accepté.
  final PhoneProblem? problem;

  /// Message affichable, en français.
  final String? message;

  /// Le numéro est-il utilisable ?
  bool get isAccepted => problem == null;
}

/// Pays, indicatifs et vérification d'un numéro de téléphone.
///
/// Un numéro n'a de sens qu'avec le plan de numérotation qui le reconnaît :
/// `07 07 07 07 07` est un numéro ivoirien et dix chiffres de trop partout
/// ailleurs. Cet outil est le pendant mobile de `src/lib/phone-countries.ts` ;
/// les deux lisent les mêmes données, générées par le même script, pour que le
/// même numéro soit accepté ou refusé des deux côtés.
///
/// Les données viennent de `phone_countries.generated.dart`, produit par
/// `npm run phones:generate` à partir des plans publiés (ITU / Wikipédia).
abstract final class PhoneCountries {
  /// Pays retenu quand la saisie ne le dit pas : la Côte d'Ivoire, seule
  /// numérotation que l'application connaissait avant que le sélecteur existe.
  static const String defaultCountryCode = 'CI';

  /// Tous les pays, par nom français — la liste est déjà ordonnée ainsi.
  static List<PhoneCountryData> get all => phoneCountriesData;

  static final Map<String, PhoneCountryData> _byCode = {
    for (final country in phoneCountriesData) country.code: country,
  };

  static final Map<String, List<PhoneCountryData>> _byDial = _groupByDial();

  static Map<String, List<PhoneCountryData>> _groupByDial() {
    final grouped = <String, List<PhoneCountryData>>{};

    for (final country in phoneCountriesData) {
      grouped.putIfAbsent(country.dial, () => <PhoneCountryData>[]).add(country);
    }

    return grouped;
  }

  /// Pays par code ISO ; le pays par défaut si le code est inconnu.
  static PhoneCountryData byCode(String code) =>
      _byCode[code.toUpperCase()] ?? defaultCountry;

  /// Pays retenu quand aucun n'est indiqué.
  static PhoneCountryData get defaultCountry => byCode(defaultCountryCode);

  /// Pays partageant un indicatif.
  ///
  /// L'indicatif 1 appartient à l'Amérique du Nord, le 44 aux îles britanniques :
  /// un numéro seul ne dit pas lequel de ces pays c'est. La liste est donc
  /// renvoyée entière, et c'est au numéro qui suit de trancher.
  static List<PhoneCountryData> byDial(String dial) =>
      _byDial[dial.replaceAll(RegExp(r'\D'), '')] ?? const <PhoneCountryData>[];

  /// Sépare l'indicatif d'un numéro déjà écrit au format international.
  ///
  /// Le pays retenu est celui dont le plan admet la longueur du reste du
  /// numéro ; sans accord possible, le premier pays de l'indicatif est pris, ce
  /// qui importe peu : les pays d'un même indicatif partagent les mêmes
  /// longueurs.
  static ({PhoneCountryData country, String digits}) splitInternational(
    String raw,
  ) {
    // `00` est l'indicatif international écrit en préfixe, pas un chiffre du
    // numéro : sans cette lecture, `00225 07 07…` serait pris pour un numéro de
    // douze chiffres d'un pays que personne n'a.
    final digits = raw.replaceAll(RegExp(r'\D'), '').replaceFirst(
      RegExp('^00'),
      '',
    );

    if (digits.isEmpty) return (country: defaultCountry, digits: '');

    // L'indicatif le plus long d'abord : « 225 » avant « 22 », sans quoi un
    // pays serait reconnu aux deux premiers chiffres de son voisin.
    for (var size = 4; size >= 1; size--) {
      if (size > digits.length) continue;

      final candidates = byDial(digits.substring(0, size));
      if (candidates.isEmpty) continue;

      final national = digits.substring(size);
      final fits = candidates.cast<PhoneCountryData?>().firstWhere(
        (country) => country != null && country.lengths.contains(national.length),
        orElse: () => null,
      );

      return (country: fits ?? candidates.first, digits: national);
    }

    return (country: defaultCountry, digits: digits);
  }

  /// Vérifie un numéro national selon le plan du pays choisi.
  ///
  /// Deux règles, dans cet ordre :
  ///
  /// - le numéro tel qu'il est écrit doit avoir une longueur admise par le pays ;
  /// - à défaut, il est réessayé sans son préfixe national. Un Français tape
  ///   `06 12 34 56 78` là où le plan compte neuf chiffres, parce que le zéro
  ///   national ne fait pas partie de son numéro : le refuser serait erroné, et
  ///   l'utilisateur n'a aucun moyen de le savoir.
  ///
  /// Les préfixes mobiles ne sont vérifiés que sur demande (`strict`), parce
  /// qu'un préfixe faux ferait refuser un numéro valide — bien plus grave qu'un
  /// numéro douteux accepté. Ils ne servent pas davantage à un avertissement :
  /// certains plans classent des numéros parfaitement valides hors de leurs
  /// plages mobiles, le `09` ivoirien des comptes de démonstration en est un, et
  /// dire à l'utilisateur que son propre numéro est suspect serait faux.
  ///
  /// Les messages citent l'indicatif plutôt que le nom du pays : « un numéro
  /// sénégalais » ou « un numéro de la Côte d'Ivoire » exigent un adjectif et
  /// un article que rien ne permet de dériver de deux lettres, alors que `+221`
  /// et `+225` sont justes pour les 245 pays.
  static PhoneValidation validate(
    PhoneCountryData country,
    String raw, {
    bool strict = false,
  }) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');

    if (digits.isEmpty) {
      return const PhoneValidation.rejected(
        PhoneProblem.empty,
        'Saisissez votre numéro de téléphone.',
      );
    }

    final national = country.trunk.isNotEmpty && digits.startsWith(country.trunk)
        ? digits.substring(country.trunk.length)
        : digits;

    final int? length = country.lengths.contains(national.length)
        ? national.length
        : (country.lengths.contains(digits.length) ? digits.length : null);

    if (length == null) {
      return PhoneValidation.rejected(
        PhoneProblem.length,
        'Un numéro ${country.dialLabel} comporte ${country.digitsLabel} '
        '(vous en avez saisi ${digits.length}).',
      );
    }

    final kept = national.length == length ? national : digits;

    if (strict &&
        country.prefixes.isNotEmpty &&
        !country.prefixes.any(kept.startsWith)) {
      return PhoneValidation.rejected(
        PhoneProblem.prefix,
        'Ce numéro ne commence pas par un préfixe mobile '
        '${country.dialLabel}.',
      );
    }

    return PhoneValidation.accepted(kept, '+${country.dial}$kept');
  }

  /// Écriture internationalisée d'un numéro saisi : `+2250707070707`.
  ///
  /// Un numéro collé avec son indicatif désigne son propre pays, et lui seul :
  /// dans ce cas, c'est lui qui fait foi, pas le pays choisi dans le sélecteur.
  static String toInternational(PhoneCountryData country, String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return '';

    final trimmed = raw.trimLeft();

    if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
      final split = splitInternational(raw);

      return '+${split.country.dial}${split.digits}';
    }

    return '+${country.dial}$digits';
  }
}