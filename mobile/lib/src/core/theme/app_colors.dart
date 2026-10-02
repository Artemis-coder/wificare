import 'package:flutter/material.dart';

/// Palette de l'application.
///
/// Les valeurs proviennent de l'ancien design system (`wificare-mobile`), qui
/// était lui-même aligné sur `design-system/wifi-care-mobile/MASTER.md`.
/// Contrary à la version React Native, les deux thèmes sont complets : plus de
/// clés manquantes comme `text` ou `textSecondary`.
@immutable
class WiFiColors extends ThemeExtension<WiFiColors> {
  const WiFiColors({
    required this.primary,
    required this.primaryDark,
    required this.primaryLight,
    required this.onPrimary,
    required this.secondary,
    required this.secondaryDark,
    required this.onSecondary,
    required this.background,
    required this.surface,
    required this.surfaceVariant,
    required this.onSurface,
    required this.onSurfaceVariant,
    required this.outline,
    required this.outlineVariant,
    required this.error,
    required this.onError,
    required this.errorContainer,
    required this.success,
    required this.onSuccess,
    required this.warning,
    required this.onWarning,
    required this.info,
    required this.onInfo,
    required this.shadow,
    required this.scrim,
    required this.backdrop,
    required this.inverseSurface,
    required this.inverseOnSurface,
    required this.inversePrimary,
    required this.neutral,
    required this.neutralVariant,
    required this.onNeutral,
  });

  final Color primary;
  final Color primaryDark;
  final Color primaryLight;
  final Color onPrimary;
  final Color secondary;
  final Color secondaryDark;
  final Color onSecondary;
  final Color background;
  final Color surface;
  final Color surfaceVariant;
  final Color onSurface;
  final Color onSurfaceVariant;
  final Color outline;
  final Color outlineVariant;
  final Color error;
  final Color onError;
  final Color errorContainer;
  final Color success;
  final Color onSuccess;
  final Color warning;
  final Color onWarning;
  final Color info;
  final Color onInfo;
  final Color shadow;
  final Color scrim;
  final Color backdrop;
  final Color inverseSurface;
  final Color inverseOnSurface;
  final Color inversePrimary;
  final Color neutral;
  final Color neutralVariant;
  final Color onNeutral;

  static const WiFiColors light = WiFiColors(
    primary: Color(0xFF0D9488),
    primaryDark: Color(0xFF0F766E),
    primaryLight: Color(0xFF2DD4BF),
    onPrimary: Color(0xFFFFFFFF),
    secondary: Color(0xFFD97706),
    secondaryDark: Color(0xFFB45309),
    onSecondary: Color(0xFFFFFFFF),
    background: Color(0xFFF0FDFA),
    surface: Color(0xFFFFFFFF),
    surfaceVariant: Color(0xFFE8F1F4),
    onSurface: Color(0xFF134E4A),
    onSurfaceVariant: Color(0xFF475569),
    outline: Color(0xFF5EEAD4),
    outlineVariant: Color(0xFF99F6E4),
    error: Color(0xFFDC2626),
    onError: Color(0xFFFFFFFF),
    errorContainer: Color(0xFFFEF2F2),
    success: Color(0xFF22C55E),
    onSuccess: Color(0xFFFFFFFF),
    warning: Color(0xFFF59E0B),
    onWarning: Color(0xFF000000),
    info: Color(0xFF3B82F6),
    onInfo: Color(0xFFFFFFFF),
    shadow: Color(0xFF000000),
    scrim: Color(0x80000000),
    backdrop: Color(0x4D000000),
    inverseSurface: Color(0xFF134E4A),
    inverseOnSurface: Color(0xFFF0FDFA),
    inversePrimary: Color(0xFF2DD4BF),
    neutral: Color(0xFF64748B),
    neutralVariant: Color(0xFF94A3B8),
    onNeutral: Color(0xFFFFFFFF),
  );

  static const WiFiColors dark = WiFiColors(
    primary: Color(0xFF2DD4BF),
    primaryDark: Color(0xFF0D9488),
    primaryLight: Color(0xFF5EEAD4),
    onPrimary: Color(0xFF000000),
    secondary: Color(0xFFFBBF24),
    secondaryDark: Color(0xFFD97706),
    onSecondary: Color(0xFF000000),
    background: Color(0xFF0F172A),
    surface: Color(0xFF1E293B),
    surfaceVariant: Color(0xFF334155),
    onSurface: Color(0xFFF0FDFA),
    onSurfaceVariant: Color(0xFF94A3B8),
    outline: Color(0xFF475569),
    outlineVariant: Color(0xFF64748B),
    error: Color(0xFFF87171),
    onError: Color(0xFF000000),
    errorContainer: Color(0xFF7F1D1D),
    success: Color(0xFF4ADE80),
    onSuccess: Color(0xFF000000),
    warning: Color(0xFFFBBF24),
    onWarning: Color(0xFF000000),
    info: Color(0xFF60A5FA),
    onInfo: Color(0xFF000000),
    shadow: Color(0xFF000000),
    scrim: Color(0xB3000000),
    backdrop: Color(0x80000000),
    inverseSurface: Color(0xFFF0FDFA),
    inverseOnSurface: Color(0xFF0F172A),
    inversePrimary: Color(0xFF0D9488),
    neutral: Color(0xFF64748B),
    neutralVariant: Color(0xFF94A3B8),
    onNeutral: Color(0xFF0F172A),
  );

  @override
  WiFiColors copyWith({
    Color? primary,
    Color? primaryDark,
    Color? primaryLight,
    Color? onPrimary,
    Color? secondary,
    Color? secondaryDark,
    Color? onSecondary,
    Color? background,
    Color? surface,
    Color? surfaceVariant,
    Color? onSurface,
    Color? onSurfaceVariant,
    Color? outline,
    Color? outlineVariant,
    Color? error,
    Color? onError,
    Color? errorContainer,
    Color? success,
    Color? onSuccess,
    Color? warning,
    Color? onWarning,
    Color? info,
    Color? onInfo,
    Color? shadow,
    Color? scrim,
    Color? backdrop,
    Color? inverseSurface,
    Color? inverseOnSurface,
    Color? inversePrimary,
    Color? neutral,
    Color? neutralVariant,
    Color? onNeutral,
  }) {
    return WiFiColors(
      primary: primary ?? this.primary,
      primaryDark: primaryDark ?? this.primaryDark,
      primaryLight: primaryLight ?? this.primaryLight,
      onPrimary: onPrimary ?? this.onPrimary,
      secondary: secondary ?? this.secondary,
      secondaryDark: secondaryDark ?? this.secondaryDark,
      onSecondary: onSecondary ?? this.onSecondary,
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceVariant: surfaceVariant ?? this.surfaceVariant,
      onSurface: onSurface ?? this.onSurface,
      onSurfaceVariant: onSurfaceVariant ?? this.onSurfaceVariant,
      outline: outline ?? this.outline,
      outlineVariant: outlineVariant ?? this.outlineVariant,
      error: error ?? this.error,
      onError: onError ?? this.onError,
      errorContainer: errorContainer ?? this.errorContainer,
      success: success ?? this.success,
      onSuccess: onSuccess ?? this.onSuccess,
      warning: warning ?? this.warning,
      onWarning: onWarning ?? this.onWarning,
      info: info ?? this.info,
      onInfo: onInfo ?? this.onInfo,
      shadow: shadow ?? this.shadow,
      scrim: scrim ?? this.scrim,
      backdrop: backdrop ?? this.backdrop,
      inverseSurface: inverseSurface ?? this.inverseSurface,
      inverseOnSurface: inverseOnSurface ?? this.inverseOnSurface,
      inversePrimary: inversePrimary ?? this.inversePrimary,
      neutral: neutral ?? this.neutral,
      neutralVariant: neutralVariant ?? this.neutralVariant,
      onNeutral: onNeutral ?? this.onNeutral,
    );
  }

  @override
  WiFiColors lerp(covariant WiFiColors? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return WiFiColors(
      primary: c(primary, other.primary),
      primaryDark: c(primaryDark, other.primaryDark),
      primaryLight: c(primaryLight, other.primaryLight),
      onPrimary: c(onPrimary, other.onPrimary),
      secondary: c(secondary, other.secondary),
      secondaryDark: c(secondaryDark, other.secondaryDark),
      onSecondary: c(onSecondary, other.onSecondary),
      background: c(background, other.background),
      surface: c(surface, other.surface),
      surfaceVariant: c(surfaceVariant, other.surfaceVariant),
      onSurface: c(onSurface, other.onSurface),
      onSurfaceVariant: c(onSurfaceVariant, other.onSurfaceVariant),
      outline: c(outline, other.outline),
      outlineVariant: c(outlineVariant, other.outlineVariant),
      error: c(error, other.error),
      onError: c(onError, other.onError),
      errorContainer: c(errorContainer, other.errorContainer),
      success: c(success, other.success),
      onSuccess: c(onSuccess, other.onSuccess),
      warning: c(warning, other.warning),
      onWarning: c(onWarning, other.onWarning),
      info: c(info, other.info),
      onInfo: c(onInfo, other.onInfo),
      shadow: c(shadow, other.shadow),
      scrim: c(scrim, other.scrim),
      backdrop: c(backdrop, other.backdrop),
      inverseSurface: c(inverseSurface, other.inverseSurface),
      inverseOnSurface: c(inverseOnSurface, other.inverseOnSurface),
      inversePrimary: c(inversePrimary, other.inversePrimary),
      neutral: c(neutral, other.neutral),
      neutralVariant: c(neutralVariant, other.neutralVariant),
      onNeutral: c(onNeutral, other.onNeutral),
    );
  }
}

/// Raccourci d'accès : `context.colors.primary`.
extension WiFiThemeX on BuildContext {
  WiFiColors get colors =>
      Theme.of(this).extension<WiFiColors>() ?? WiFiColors.light;
}
