import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/domain/enums.dart';
import 'core/providers/infra_providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/auth_controller.dart';

/// Racine de l'application : thème Material 3 + `GoRouter`.
class WiFiCareApp extends ConsumerStatefulWidget {
  const WiFiCareApp({super.key});

  @override
  ConsumerState<WiFiCareApp> createState() => _WiFiCareAppState();
}

class _WiFiCareAppState extends ConsumerState<WiFiCareApp>
    with WidgetsBindingObserver {
  /// La restauration de session n'est résolue qu'une fois, au démarrage. C'est
  /// le seul chargement qui doit forcer une redirection, celui de l'écran de
  /// connexion.
  bool _restoreResolved = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _openTicketFromNotification();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // L'utilisateur a tapé sur la notification alors que l'application était
    // fermée : Android la réveille et l'event arrive ici.
    if (state == AppLifecycleState.resumed) {
      _openTicketFromNotification();
    }
  }

  /// Ouvre la demande sur laquelle l'utilisateur a tapé sur la notification.
  ///
  /// Le push n'est reçu que par le téléphone : l'identifiant de la demande est
  /// mis en attente par le service, et consommé au retour dans l'application.
  void _openTicketFromNotification() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      final ticketId = ref.read(pushServiceProvider).takePendingTicketId();

      if (ticketId == null) return;

      // Sans session, la demande n'est pas visible : la redirection de sécurité
      // du routeur enverra de toute façon vers la connexion.
      if (!ref.read(authControllerProvider.notifier).isAuthenticated) return;

      final prefix = ref.read(currentUserProvider)?.role == UserRole.technician
          ? TechnicianRoutes.tickets
          : Routes.tickets;

      ref.read(appRouterProvider).go('$prefix/$ticketId');
    });
  }

  @override
  Widget build(BuildContext context) {
    // `GoRouter` n'évalue ses redirections qu'à la navigation ou sur
    // notification : sans cet écouteur, la fin de la restauration de session
    // laisserait l'application bloquée sur le splash.
    ref.listen(authControllerProvider, (previous, next) {
      if (next.isLoading) return;

      if (!_restoreResolved) {
        _restoreResolved = true;
        ref.read(routerRefreshProvider).trigger();
        return;
      }

      // Ensuite, seule l'apparition ou la disparition de la session change la
      // destination. Un échec de connexion ne change rien : déclencher ici
      // ferait reconstruire la page, effaçant la saisie en cours et le message
      // d'erreur que l'écran vient d'afficher.
      if ((previous?.value == null) != (next.value == null)) {
        ref.read(routerRefreshProvider).trigger();
      }
    });

    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'WiFi Care',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
