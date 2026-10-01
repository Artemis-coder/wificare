import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/core/push/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Enregistré avant `runApp` : une notification reçue alors que l'application
  // est en arrière-plan doit pouvoir être affichée, même avant le premier
  // cadre dessiné.
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  runApp(const ProviderScope(child: WiFiCareApp()));
}
