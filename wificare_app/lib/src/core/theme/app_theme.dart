import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Échelle d'espacement (4 / 8 / 16 / 24 / 32 / 48 / 64).
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
  static const double xxxl = 64;
}

abstract final class AppRadius {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double full = 9999;
}

abstract final class AppShadows {
  static const List<BoxShadow> sm = [
    BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1)),
  ];
  static const List<BoxShadow> md = [
    BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 4)),
  ];
  static const List<BoxShadow> lg = [
    BoxShadow(color: Color(0x1A000000), blurRadius: 15, offset: Offset(0, 10)),
  ];
  static const List<BoxShadow> xl = [
    BoxShadow(color: Color(0x26000000), blurRadius: 25, offset: Offset(0, 20)),
  ];
}

/// Cible tactile minimale (Material 3 : 48dp).
const double kMinTouchTarget = 48;

abstract final class AppTheme {
  static ThemeData light() => _build(Brightness.light, WiFiColors.light);
  static ThemeData dark() => _build(Brightness.dark, WiFiColors.dark);

  static ThemeData _build(Brightness brightness, WiFiColors colors) {
    final scheme =
        ColorScheme.fromSeed(
          seedColor: colors.primary,
          brightness: brightness,
        ).copyWith(
          primary: colors.primary,
          onPrimary: colors.onPrimary,
          secondary: colors.secondary,
          onSecondary: colors.onSecondary,
          error: colors.error,
          onError: colors.onError,
          surface: colors.surface,
          onSurface: colors.onSurface,
          outline: colors.outline,
        );

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: colors.background,
      splashFactory: InkSparkle.splashFactory,
    );

    TextStyle text(Color color, {double size = 14, FontWeight? weight, double? height}) =>
        TextStyle(
          color: color,
          fontSize: size,
          fontWeight: weight ?? FontWeight.w400,
          height: height ?? 1.45,
        );

    return base.copyWith(
      extensions: [colors],
      textTheme: base.textTheme.copyWith(
        headlineSmall: text(colors.onSurface, size: 24, weight: FontWeight.w700),
        titleLarge: text(colors.onSurface, size: 20, weight: FontWeight.w700),
        titleMedium: text(colors.onSurface, size: 16, weight: FontWeight.w700),
        titleSmall: text(colors.onSurface, size: 14, weight: FontWeight.w500),
        bodyLarge: text(colors.onSurface, size: 16),
        bodyMedium: text(colors.onSurface, size: 14),
        bodySmall: text(colors.onSurfaceVariant, size: 12),
        labelLarge: text(colors.onPrimary, size: 16, weight: FontWeight.w700),
        labelMedium: text(colors.onSurfaceVariant, size: 12, weight: FontWeight.w500),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: colors.background,
        foregroundColor: colors.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: text(colors.onSurface, size: 20, weight: FontWeight.w700),
      ),
      cardTheme: CardThemeData(
        color: colors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          side: BorderSide(color: colors.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surfaceVariant.withValues(alpha: 0.4),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.error, width: 2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.error, width: 2),
        ),
        labelStyle: TextStyle(color: colors.onSurfaceVariant, fontSize: 14),
        helperStyle: TextStyle(color: colors.onSurfaceVariant, fontSize: 12),
        errorStyle: TextStyle(color: colors.error, fontSize: 12),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: colors.onPrimary,
          disabledBackgroundColor: colors.neutralVariant,
          minimumSize: const Size.fromHeight(kMinTouchTarget),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.primary,
          minimumSize: const Size.fromHeight(kMinTouchTarget),
          side: BorderSide(color: colors.primary),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colors.primary,
          minimumSize: const Size(64, kMinTouchTarget),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: colors.surfaceVariant,
        side: BorderSide(color: colors.outlineVariant),
        labelStyle: TextStyle(color: colors.onSurface, fontSize: 13),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.full),
        ),
      ),
      dividerTheme: DividerThemeData(color: colors.outlineVariant, space: 1, thickness: 1),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.surface,
        indicatorColor: colors.primary.withValues(alpha: 0.15),
        height: 72,
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.onSurfaceVariant),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 24,
            color: states.contains(WidgetState.selected) ? colors.primary : colors.onSurfaceVariant,
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: colors.inverseSurface,
        contentTextStyle: TextStyle(color: colors.inverseOnSurface),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: colors.primary),
    );
  }
}
