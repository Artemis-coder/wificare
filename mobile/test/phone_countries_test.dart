import 'package:flutter_test/flutter_test.dart';
import 'package:wificare_app/src/core/utils/phone_countries.dart';

/// Vérifie la vérification des numéros de téléphone.
///
/// Les cas partent des numéros que l'application connaît déjà — les comptes de
/// démonstration — et des pièges de numérotation les plus fréquents : préfixe
/// national en trop, indicatif collé au numéro, longueur d'un autre pays.
void main() {
  PhoneValidation accept(String code, String raw) =>
      PhoneCountries.validate(PhoneCountries.byCode(code), raw);

  group('longueur du plan', () {
    test('un numéro ivoirien compte dix chiffres', () {
      final result = accept('CI', '0909090909');

      expect(result.isAccepted, isTrue);
      expect(result.e164, '+2250909090909');
    });

    test('un numéro sénégalais en compte neuf', () {
      expect(accept('SN', '701234567').e164, '+221701234567');
    });

    test('neuf chiffres sont refusés pour la Côte d’Ivoire', () {
      final result = accept('CI', '070707070');

      expect(result.isAccepted, isFalse);
      expect(result.problem, PhoneProblem.length);
      expect(
        result.message,
        'Un numéro +225 comporte 10 chiffres (vous en avez saisi 9).',
      );
    });

    test('un champ vide est refusé avant toute autre règle', () {
      expect(accept('CI', '').problem, PhoneProblem.empty);
    });
  });

  group('préfixe national', () {
    test('un numéro français s’écrit avec son zéro national', () {
      expect(accept('FR', '06 12 34 56 78').e164, '+33612345678');
    });

    test('et aussi sans lui, que le plan ne compte pas', () {
      expect(accept('FR', '612345678').e164, '+33612345678');
    });

    test('le zéro ivoirien fait partie du numéro', () {
      expect(accept('CI', '0707070707').e164, '+2250707070707');
    });
  });

  group('préfixes mobiles', () {
    test('un préfixe hors plan reste accepté par défaut', () {
      // Le `09` ivoirien n'est pas dans les plages mobiles du plan, et c'est
      // pourtant le numéro d'un compte de démonstration : un plan mobile est
      // plus étroit que les numéros réellement en circulation.
      expect(accept('CI', '0909090909').isAccepted, isTrue);
    });

    test('il n’est refusé que si la vérification stricte est demandée', () {
      final strict = PhoneCountries.validate(
        PhoneCountries.byCode('CI'),
        '0909090909',
        strict: true,
      );

      expect(strict.isAccepted, isFalse);
      expect(strict.problem, PhoneProblem.prefix);
    });

    test('un préfixe du plan passe la vérification stricte', () {
      expect(
        PhoneCountries.validate(
          PhoneCountries.byCode('CI'),
          '0707070707',
          strict: true,
        ).isAccepted,
        isTrue,
      );
    });

    test('un plan sans donnée de préfixe laisse tout passer', () {
      // Les États-Unis publient des centaines d'indicatifs de zone : la donnée
      // est abandonnée, et une vérification stricte n'a plus rien à dire.
      expect(
        PhoneCountries.validate(
          PhoneCountries.byCode('US'),
          '2015550123',
          strict: true,
        ).isAccepted,
        isTrue,
      );
    });
  });

  group('numéros internationaux', () {
    test('le préfixe 00 est un indicatif, pas un zéro national', () {
      final split = PhoneCountries.splitInternational('00225 09 09 09 09 09');

      expect(split.country.code, 'CI');
      expect(split.digits, '0909090909');
    });

    test('un indicatif de trois chiffres n’est pas confondu avec son préfixe', () {
      expect(
        PhoneCountries.splitInternational('+2250909090909').country.code,
        'CI',
      );
    });

    test('un numéro nord-américain est attribué à un pays de l’indicatif 1', () {
      final split = PhoneCountries.splitInternational('+12015550123');

      expect(split.country.dial, '1');
      expect(split.digits, '2015550123');
    });

    test('un numéro collé prime sur le pays choisi', () {
      expect(
        PhoneCountries.toInternational(
          PhoneCountries.byCode('FR'),
          '+2250909090909',
        ),
        '+2250909090909',
      );
    });

    test('un numéro national prend l’indicatif du pays choisi', () {
      expect(
        PhoneCountries.toInternational(
          PhoneCountries.byCode('FR'),
          '612345678',
        ),
        '+33612345678',
      );
    });
  });

  group('données générées', () {
    test('les pays suivent l’ordre alphabétique français', () {
      int rank(String name) =>
          PhoneCountries.all.indexWhere((country) => country.name == name);

      // « Côte d’Ivoire » avant « Croatie » : un tri par caractère classerait
      // l'inverse, l'accent de « ô » valant plus que « r ». C'est bien
      // l'ordre alphabétique français qui est appliqué.
      expect(rank("Côte d’Ivoire"), lessThan(rank('Croatie')));
      expect(rank('Sénégal'), lessThan(rank('Tanzanie')));
    });

    test('chaque pays a un drapeau, un exemple et au moins une longueur', () {
      expect(PhoneCountries.all.length, greaterThan(200));

      for (final country in PhoneCountries.all) {
        expect(country.code.length, 2, reason: country.name);
        expect(country.dial, isNotEmpty, reason: country.name);
        expect(country.lengths, isNotEmpty, reason: country.name);
        expect(country.example.replaceAll(RegExp(r'\D'), ''), isNotEmpty);
        expect(country.flag.runes.length, 2, reason: country.name);
      }
    });

    test('le pays par défaut reste la Côte d’Ivoire', () {
      // Les comptes déjà enregistrés en base sont ivoiriens : un autre pays par
      // défaut les rendrait introuvables.
      expect(PhoneCountries.defaultCountry.code, 'CI');
      expect(PhoneCountries.byCode('ZZ').code, 'CI');
    });
  });
}