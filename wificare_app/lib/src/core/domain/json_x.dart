import 'package:flutter/material.dart';

/// Helpers de désérialisation tolérants.
///
/// Le backend renvoie des dates ISO (`2026-01-30T10:00:00.000Z`) et beaucoup de
/// champs nullables ; ces fonctions évite de casser sur une réponse partielle.
abstract final class JsonX {
  static String str(dynamic value, {String fallback = ''}) =>
      value is String ? value : (value?.toString() ?? fallback);

  static String? strOrNull(dynamic value) {
    if (value == null) return null;
    final text = value is String ? value : value.toString();
    return text.isEmpty ? null : text;
  }

  static int integer(dynamic value, {int fallback = 0}) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? fallback;
    return fallback;
  }

  static int? integerOrNull(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  static double decimal(dynamic value, {double fallback = 0}) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? fallback;
    return fallback;
  }

  static double? decimalOrNull(dynamic value) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static bool flag(dynamic value, {bool fallback = false}) {
    if (value is bool) return value;
    if (value is String) return value == 'true';
    return fallback;
  }

  static DateTime? date(dynamic value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }

  static Map<String, dynamic> map(dynamic value) =>
      value is Map<String, dynamic> ? value : const <String, dynamic>{};

  static Map<String, dynamic>? mapOrNull(dynamic value) =>
      value is Map<String, dynamic> ? value : null;

  static List<Map<String, dynamic>> list(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map<String, dynamic>>().toList(growable: false);
  }

  static List<String> strings(dynamic value) {
    if (value is! List) return const [];
    return value.map((e) => e.toString()).toList(growable: false);
  }

  static Color hexColor(String hex) {
    final cleaned = hex.replaceFirst('#', '');
    final value = int.tryParse(cleaned, radix: 16) ?? 0xFF000000;
    return Color(cleaned.length == 6 ? 0xFF000000 | value : value);
  }
}
