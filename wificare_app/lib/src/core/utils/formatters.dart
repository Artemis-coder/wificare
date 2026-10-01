import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

/// Formateurs partagés (fr-FR, montants en FCFA).
///
/// `intl` ne charge les données de locale qu'à la demande : sans
/// `initializeDateFormatting`, le premier `DateFormat('fr_FR')` lève une
/// exception au runtime. L'initialisation est donc faite ici, paresseusement,
/// quel que soit le point d'entrée de l'application.
abstract final class Fmt {
  static final String locale = 'fr_FR';

  static bool _ready = false;

  static void _ensure() {
    if (_ready) return;
    initializeDateFormatting(locale);
    _ready = true;
  }

  static NumberFormat get _currency {
    _ensure();
    return NumberFormat.currency(
      locale: locale,
      symbol: 'FCFA',
      decimalDigits: 0,
    );
  }

  static DateFormat _df(String pattern) {
    _ensure();
    return DateFormat(pattern, locale);
  }

  static String money(num amount) => _currency.format(amount);

  static String date(DateTime? value) => value == null ? '—' : _df('dd/MM/yyyy').format(value);

  static String dateTime(DateTime? value) =>
      value == null ? '—' : _df('dd/MM/yyyy à HH:mm').format(value);

  static String dayMonth(DateTime? value) =>
      value == null ? '—' : _df('d MMM yyyy').format(value);

  static String relativeDay(DateTime? value) {
    if (value == null) return '—';
    final now = DateTime.now();
    final day = DateTime(value.year, value.month, value.day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(day).inDays;

    if (diff == 0) return "Aujourd'hui";
    if (diff == 1) return 'Hier';
    if (diff > 1 && diff < 7) return 'Il y a $diff jours';
    return _df('dd/MM/yyyy').format(value);
  }

  /// Normalise un numéro ivoirien vers le format international `+225...`.
  ///
  /// Les numéros mobile ivoiriens s'écrivent `0707070707` (10 chiffres) : le
  /// zéro national fait partie du numéro, il ne doit pas être retiré.
  static String normalizePhone(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) return '';
    if (digits.startsWith('225')) return '+$digits';
    if (digits.startsWith('00')) return '+${digits.substring(2)}';
    return '+225$digits';
  }

  static String minutes(int? value) {
    if (value == null) return '—';
    if (value < 60) return '$value min';
    final hours = value ~/ 60;
    final rest = value % 60;
    return rest == 0 ? '$hours h' : '$hours h $rest min';
  }

  /// Arrivée annoncée par le serveur, en toutes lettres.
  ///
  /// Sous deux minutes, le compte n'a plus de sens : on annonce l'arrivée plutôt
  /// qu'un « dans 1 min » qui devient faux presque immédiatement.
  static String eta(int? minutes) {
    if (minutes == null) return '—';
    if (minutes <= 1) return 'Arrivée imminente';
    if (minutes < 60) return 'dans $minutes min';
    return 'dans ${minutes ~/ 60} h${minutes % 60 == 0 ? '' : ' ${minutes % 60}'}';
  }

  /// Distance lisible, mètres sous un kilomètre.
  static String distance(int? meters) {
    if (meters == null) return '—';
    if (meters < 1000) return '$meters m';
    return '${(meters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  }

  /// Ancienneté d'une position, en une expression courte.
  static String since(DateTime? value) {
    if (value == null) return '—';

    final minutes = DateTime.now().difference(value).inMinutes;

    if (minutes <= 0) return 'à l\'instant';
    if (minutes == 1) return 'il y a 1 min';
    if (minutes < 60) return 'il y a $minutes min';

    final hours = minutes ~/ 60;
    if (hours == 1) return 'il y a 1 h';
    if (hours < 24) return 'il y a $hours h';

    return 'il y a ${hours ~/ 24} j';
  }
}
