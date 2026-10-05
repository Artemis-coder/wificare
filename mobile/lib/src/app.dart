import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/domain/enums.dart';
import 'core/providers/infra_providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/auth_controller.dart';
import 'features/technician/application/tracking_controller.dart';

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
      // L'utilisateur peut aussi revenir des réglages du téléphone, où il vient
      // d'accorder la localisation en arrière-plan. Cette autorisation n'est
      // lisible qu'à son retour, et le suivi en dépend : sans cette relecture,
      // le technicien repartait devant le même message, et le client n'aurait
      // jamais vu d'ETA.
      ref.read(technicianTrackingProvider.notifier).resume();

      _openTicketFromNotification();
    }
  }

  /// Ouvre ce sur quoi l'utilisateur a tapé dans la notification.
  ///
  /// Le push n'est reçu que par le téléphone : l'identifiant est mis en attente
  /// par le service, et consommé au retour dans l'application. Deux cibles
  /// possibles, parce qu'une notification peut porter l'une ou l'autre : la
  /// demande d'un technicien qui l'a prise, et la proposition d'une demande
  /// qu'il n'a pas encore acceptée. La seconde s'ouvre sur la file des offres,
  /// qui en porte le contenu — l'ouvrir comme une demande lui renverrait un
  /// refus, la n'étant pas encore la sienne.
  void _openTicketFromNotification() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      final push = ref.read(pushServiceProvider);
      final offerId = push.takePendingOfferId();
      final ticketId = push.takePendingTicketId();

      if (offerId == null && ticketId == null) return;

      // Sans session, rien n'est visible : la redirection de sécurité du
      // routeur enverra de toute façon vers la connexion.
      if (!ref.read(authControllerProvider.notifier).isAuthenticated) return;

      final router = ref.read(appRouterProvider);

      if (offerId != null) {
        if (ref.read(currentUserProvider)?.role != UserRole.technician) return;
        router.go('${TechnicianRoutes.offers}?offer=$offerId');
        return;
      }

      final prefix = ref.read(currentUserProvider)?.role == UserRole.technician
          ? TechnicianRoutes.tickets
          : Routes.tickets;

      router.go('$prefix/$ticketId');
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
