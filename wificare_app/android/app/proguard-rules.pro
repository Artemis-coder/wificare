# Fluttercompress deja gere le code Dart (AOT) : aucune regle specifique n'est
# necessaire pour les plugins Flutter.
# Regles ajoutees au besoin lors d'une publication reelle.
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**
