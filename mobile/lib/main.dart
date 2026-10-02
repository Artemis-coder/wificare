import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/core/push/push_service.dart';
import 'src/core/providers/infra_providers.dart';
import 'src/core/storage/token_storage.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Enregistré avant `runApp` : une notification reçue alors que l'application
  // est en arrière-plan doit pouvoir être affichée, même avant le premier
  // cadre dessiné.
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  // Lue avant `runApp` parce que la redirection du routeur est synchrone : elle
  // doit savoir, au premier cadre, si l'écran d'accueil a déjà été vu. Le lire
  // dans le routeur obligerait à rediriger « dans le vide » en attendant la
  // lecture, et l'utilisateur verrait un aller-retour connexion → accueil.
  //
  // Un échec de lecture vaut « pas encore vu » : l'écran est alors reproposé,
  // ce qui est le rappel inutile plutôt que l'écran perdu.
  var onboardingSeen = false;

  try {
    onboardingSeen = await TokenStorage().hasSeenOnboarding();
  } catch (_) {
    onboardingSeen = false;
  }

  runApp(
    ProviderScope(
      overrides: [onboardingSeenProvider.overrideWithValue(onboardingSeen)],
      child: const WiFiCareApp(),
    ),
  );
}