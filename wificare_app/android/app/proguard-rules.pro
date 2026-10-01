# Flutter compresse deja gere le code Dart (AOT) : aucune regle specifique n'est
# necessaire pour les plugins Flutter.
# Regles ajoutees au besoin lors d'une publication reelle.
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# ---------------------------------------------------------------------------
# Firebase Cloud Messaging
# ---------------------------------------------------------------------------
# Sans ces regles, R8 supprime les classes de transport de Firebase dans
# l'APK release : `getToken()` echoue silencieusement, aucune notification
# n'arrive, et l'application n'a aucun moyen de le signaler. Le bug n'apparait
# qu'en release, le build debug livrant les classes intactes.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**

# Le service de reception des messages est instancie par Android depuis le
# manifeste, jamais par le code Dart : R8 ne voit pas la reference.
-keep class com.google.firebase.messaging.** { *; }
-keep class com.google.firebase.iid.** { *; }

# `flutter_local_notifications` s'appuie sur la reflexion pour resoudre ses
# adaptateurs de plateforme.
-keep class com.dexterous.flutterlocalnotifications.** { *; }
-keep class * extends com.dexterous.flutterlocalnotifications.** { *; }
-dontwarn com.dexterous.flutterlocalnotifications.**

# Les adaptateurs de reception deserialize les donnees par reflexion.
-keepattributes Signature, *Annotation*, InnerClasses, EnclosingMethod
# ---------------------------------------------------------------------------
# Suivi de position (LocationTrackingService)
# ---------------------------------------------------------------------------
# Le service est instancie par Android depuis le manifeste et le canal Dart ne
# le voit jamais : R8 ne trouve aucune reference et supprime la classe. Le
# résultat est un service qui ne démarre jamais, sans le moindre message, et
# uniquement en release (le build debug livre les classes intactes).
-keep class com.wificare.mobile.LocationTrackingService { *; }
-keep class com.wificare.mobile.MainActivity { *; }

# `TrackingSession` et `LocationPermissions` sont appeles par reflection-free
# mais depuis le canal : les conserver evite qu'une optimisation inline supprime
# un etat lu par `status()`.
-keep class com.wificare.mobile.TrackingSession { *; }
-keep class com.wificare.mobile.TrackingSession$Auth { *; }
-keep class com.wificare.mobile.LocationPermissions { *; }

# Les `LocationCallback` sont crees en classe anonyme : sans cette regle, R8
# renomme la classe implements `com.google.android.gms.location.LocationCallback`
# et la restauration du callback par le SDK echoue silencieusement.
-keep class * implements com.google.android.gms.location.LocationCallback { *; }

# Le SDK de localisation fusionnee est resolu a l'execution.
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.location.**
