import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/onboarding_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/client/presentation/dashboard_screen.dart';
import '../../features/client/presentation/equipments_screen.dart';
import '../../features/client/presentation/profile_screen.dart';
import '../../features/invoices/presentation/invoice_detail_screen.dart';
import '../../features/invoices/presentation/invoices_screen.dart';
import '../../features/reviews/presentation/reviews_screen.dart';
import '../../features/reviews/presentation/technician_reviews_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/shell/presentation/client_shell.dart';
import '../../features/tickets/presentation/ticket_detail_screen.dart';
import '../../features/tickets/presentation/ticket_new_screen.dart';
import '../../features/tickets/presentation/tickets_list_screen.dart';
import '../../features/technician/presentation/offers_screen.dart';
import '../../features/technician/presentation/technician_dashboard_screen.dart';
import '../../features/technician/presentation/technician_profile_screen.dart';
import '../../features/technician/presentation/technician_shell.dart';
import '../../features/technician/presentation/technician_ticket_screen.dart';
import '../../features/technician/presentation/technician_tickets_screen.dart';
import '../../features/technician/presentation/technician_wallet_screen.dart';
import '../config/env.dart';
import '../domain/enums.dart';
import '../providers/infra_providers.dart';
import '../widgets/app_logo.dart';

abstract final class Routes {
  static const splash = '/';

  /// Explication des autorisations, à la toute première ouverture.
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const register = '/register';
  static const home = '/home/dashboard';
  static const dashboard = '/home/dashboard';
  static const tickets = '/home/tickets';
  static const ticketNew = '/home/tickets/new';
  static const ticketDetail = '/home/tickets/:id';
  static const equipments = '/home/equipments';
  static const invoices = '/home/invoices';
  static const invoiceDetail = '/home/invoices/:id';

  /// Page enfant de l'accueil : le profil s'ouvre depuis l'avatar du tableau de
  /// bord, ce n'est pas un onglet de la barre de navigation.
  static const profile = '/home/dashboard/profile';

  /// Page enfant de l'accueil, comme le profil : la barre de navigation reste
  /// visible dessus.
  static const notifications = '/home/dashboard/notifications';

  /// Avis déposés par le client sur ses interventions.
  static const reviews = '/home/reviews';
}

/// Routes de l'espace technicien.
///
/// Le technicien n'a pas les mêmes outils que le client : il reçoit des
/// demandes et les traite, sans gérer de zones ni d'équipements.
abstract final class TechnicianRoutes {
  static const home = '/tech/dashboard';
  static const dashboard = '/tech/dashboard';
  static const tickets = '/tech/tickets';
  static const ticketDetail = '/tech/tickets/:id';
  static const profile = '/tech/dashboard/profile';
  static const notifications = '/tech/dashboard/notifications';

  /// Avis reçus des clients, en lecture seule.
  static const reviews = '/tech/reviews';

  /// Encaissements du technicien, mois par mois.
  ///
  /// Une section, et non une carte de l'accueil. Le portefeuille est l'une des
  /// quatre choses pour lesquelles un technicien ouvre l'application : ce qu'il
  /// a encaissé ce mois se consulte, il ne se découvre pas en passant. Et
  /// l'accueil a un autre métier — dire ce qu'il y a à faire maintenant ; un
  /// relevé mensuel y prend la place d'une demande à traiter.
  static const wallet = '/tech/wallet';

  /// Demandes que le circuit propose au technicien, en attente qu'il en
  /// prenne une.
  ///
  /// Page enfant de l'accueil, comme le profil : ce n'est pas une tâche de
  /// terrain — il n'y est pas encore affecté — et lui donner un onglet
  /// signifierait y faire figurer des demandes qui ne sont pas les siennes.
  ///
  /// Elle porte un paramètre `offer` : une notification push ouvre l'écran avec
  /// l'identifiant de la proposition, et la feuille de détail s'ouvre dès que la
  /// file contient cette proposition.
  static const offers = '/tech/dashboard/offers';

  static const List<String> branches = ['dashboard', 'tickets', 'wallet', 'reviews'];
}

/// Clé de navigation typée pour les onglets.
class ClientTab {
  const ClientTab({required this.path, required this.label, required this.icon});

  final String path;
  final String label;
  final IconData icon;

  static const List<ClientTab> tabs = [
    ClientTab(path: 'dashboard', label: 'Accueil', icon: Icons.home_rounded),
    ClientTab(path: 'tickets', label: 'Pannes', icon: Icons.report_problem_rounded),
    ClientTab(path: 'equipments', label: 'Équipements', icon: Icons.router_rounded),
    ClientTab(path: 'invoices', label: 'Factures', icon: Icons.receipt_long_rounded),
    ClientTab(path: 'reviews', label: 'Avis', icon: Icons.star_outline_rounded),
  ];

  /// Segments d'URL des onglets, dans le même ordre que [tabs].
  ///
  /// Le profil n'est pas un onglet : c'est une page enfant de l'accueil,
  /// ouverte en touchant l'avatar du tableau de bord.
  static const List<String> branches = [
    'dashboard',
    'tickets',
    'equipments',
    'invoices',
    'reviews',
  ];
}

/// Index de l'onglet « Accueil » dans une liste de branches.
int dashboardTabIndex(List<String> branches) => branches.indexOf('dashboard');

/// Faut-il revenir à la page racine de l'onglet plutôt que à sa dernière page
/// visitée ?
///
/// Recliquer sur l'onglet courant ramène toujours à sa racine : c'est le geste
/// pour sortir d'un détail ou d'un formulaire. L'onglet « Accueil » s'y ajoute,
/// parce que ses pages enfants — profil et notifications — sont des écrans
/// modaux, ouverts depuis le tableau de bord et refermés avec le bouton retour.
///
/// Sans cette exception, une fois le profil consulté, l'onglet « Accueil »>
/// restaure le profil au lieu du tableau de bord : revenir sur l'onglet ne
/// change rien à l'écran, et le bouton paraît ne pas fonctionner.
///
/// Les autres onglets conservent leur pile : revenir sur « Factures » après
/// avoir ouvert une facture doit rouvrir cette facture, pas la liste.
bool shouldGoToTabRoot({
  required int index,
  required int selectedIndex,
  required List<String> branches,
}) =>
    index == selectedIndex || index == dashboardTabIndex(branches);

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ref.watch(routerRefreshProvider);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    debugLogDiagnostics: false,
    // Enregistre chaque changement d'écran comme une vue `$screen`.
    // Sans cet observateur, l'application n'envoie aucune vue
    // d'écran : le SDK ne les capture pas de lui-même, et un
    // tableau de bord sans pages vues ne dit rien de l'usage.
    // Les noms viennent du `name` de chaque route ci-dessous.
    // L'observateur n'est ajouté que si PostHog est configuré :
    // un build de développement local n'installe pas un
    // observateur qui n'a nulle part où envoyer.
    observers: [
      if (AppConfig.posthogToken.isNotEmpty) PosthogObserver(),
    ],
    routes: [
      GoRoute(
        name: 'splash',
        path: Routes.splash,
        builder: (_, _) => const _SplashScreen(),
      ),
      // Première ouverture seulement. L'écran explique les deux
      // autorisations avant de les demander, et ne bloque pas l'application si
      // l'utilisateur refuse : le drapeau est mémorisé, donc il ne revient pas
      // au démarrage suivant.
      GoRoute(
        name: 'onboarding',
        path: Routes.onboarding,
        builder: (context, state) => OnboardingScreen(
          onDone: () async {
            // Mémorisé avant la redirection : si l'écriture échoue, on
            // reproposera l'écran plutôt que de le perdre.
            await ref.read(tokenStorageProvider).markOnboardingSeen();

            if (context.mounted) context.go(Routes.login);
          },
        ),
      ),
      GoRoute(
        name: 'login',
        path: Routes.login,
        builder: (_, _) => const LoginScreen(),
      ),
      GoRoute(
        name: 'register',
        path: Routes.register,
        builder: (_, _) => const RegisterScreen(),
      ),
      // Une branche par onglet : la barre de navigation reste affichée sur
      // toutes les pages de l'espace client, et chaque onglet conserve sa
      // propre pile (retour sur « Pannes » après une création = liste, pas
      // formulaire).
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => ClientShell(
          navigation: navigationShell,
          location: state.uri.path,
          onSelectTab: (index, {bool initialLocation = false}) =>
              navigationShell.goBranch(index, initialLocation: initialLocation),
        ),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'client-dashboard',
                path: Routes.dashboard,
                builder: (_, _) => const DashboardScreen(),
                routes: [
                  GoRoute(
                    name: 'client-profile',
                    path: 'profile',
                    builder: (_, _) => const ProfileScreen(),
                  ),
                  GoRoute(
                    name: 'client-notifications',
                    path: 'notifications',
                    builder: (_, _) => const NotificationsScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'client-tickets',
                path: Routes.tickets,
                builder: (_, _) => const TicketsListScreen(),
                routes: [
                  GoRoute(
                    name: 'client-ticket-new',
                    path: 'new',
                    builder: (_, _) => const TicketNewScreen(),
                  ),
                  GoRoute(
                    name: 'client-ticket-detail',
                    path: ':id',
                    builder: (context, state) =>
                        TicketDetailScreen(ticketId: state.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'client-equipments',
                path: Routes.equipments,
                builder: (_, _) => const EquipmentsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'client-invoices',
                path: Routes.invoices,
                builder: (_, _) => const InvoicesScreen(),
                routes: [
                  GoRoute(
                    name: 'client-invoice-detail',
                    path: ':id',
                    builder: (context, state) =>
                        InvoiceDetailScreen(invoiceId: state.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'client-reviews',
                path: Routes.reviews,
                builder: (_, _) => const ReviewsScreen(),
              ),
            ],
          ),
        ],
      ),

      // Espace technicien : mêmes guarantees de navigation (barre visible sur
      // les pages enfants, pile par onglet), mais des écrans et des règles
      // métier différents — pas de zones ni d'équipements.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => TechnicianShell(
          navigation: navigationShell,
          location: state.uri.path,
          onSelectTab: (index, {bool initialLocation = false}) =>
              navigationShell.goBranch(index, initialLocation: initialLocation),
        ),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'tech-dashboard',
                path: TechnicianRoutes.dashboard,
                builder: (_, _) => const TechnicianDashboardScreen(),
                routes: [
                  GoRoute(
                    name: 'tech-profile',
                    path: 'profile',
                    builder: (_, _) => const TechnicianProfileScreen(),
                  ),
                  GoRoute(
                    name: 'tech-notifications',
                    path: 'notifications',
                    builder: (_, _) => const NotificationsScreen(),
                  ),
                  GoRoute(
                    name: 'tech-offers',
                    path: 'offers',
                    builder: (_, state) => OffersScreen(
                      initialOfferId: state.uri.queryParameters['offer'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'tech-tickets',
                path: TechnicianRoutes.tickets,
                builder: (_, _) => const TechnicianTicketsScreen(),
                routes: [
                  GoRoute(
                    name: 'tech-ticket-detail',
                    path: ':id',
                    builder: (context, state) => TechnicianTicketScreen(
                      ticketId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'tech-wallet',
                path: TechnicianRoutes.wallet,
                builder: (_, _) => const TechnicianWalletScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: 'tech-reviews',
                path: TechnicianRoutes.reviews,
                builder: (_, _) => const TechnicianReviewsScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Text('Page introuvable : ${state.uri}'),
      ),
    ),
    redirect: (context, state) {
      final asyncSession = ref.read(authControllerProvider);
      final location = state.matchedLocation;

      // Tant que la session n'est pas restaurée, on reste sur le splash :
      // rediriger trop tôt provoquerait un aller-retour login/home.
      if (asyncSession.isLoading) {
        return location == Routes.splash ? null : Routes.splash;
      }

      final session = asyncSession.value;
      final authenticated = session != null;

      if (!authenticated) {
        // `/register` est atteignable sans session, comme la connexion.
        if (location == Routes.login || location == Routes.register) return null;

        // Première ouverture : l'écran d'accueil précède la connexion, parce
        // qu'il doit expliquer les autorisations avant de les demander. Une
        // fois vu, le drapeau fait son travail et l'utilisateur va droit au
        // formulaire de connexion.
        if (!ref.read(onboardingSeenProvider)) return Routes.onboarding;

        return Routes.login;
      }

      // Chaque rôle a son propre espace : un technicien n'a pas de zones ni
      // d'équipements, un propriétaire n'a pas d'intervention à mener.
      final isTechnician = session.user.role == UserRole.technician;
      final home = isTechnician ? TechnicianRoutes.home : Routes.home;
      final ownArea = isTechnician
          ? location.startsWith('/tech/')
          : location.startsWith('/home/');

      if (location == Routes.login ||
          location == Routes.register ||
          location == Routes.splash) {
        return home;
      }

      if (ownArea) return null;

      // Un utilisateur connecté qui ouvre l'espace de l'autre rôle est renvoyé
      // vers le sien.
      return home;
    },
  );
});

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppLogo(size: 72),
            const SizedBox(height: 20),
            Text('WiFi Care', style: theme.textTheme.titleLarge),
            const SizedBox(height: 24),
            const SizedBox(
              height: 22,
              width: 22,
              child: CircularProgressIndicator(strokeWidth: 2.4),
            ),
          ],
        ),
      ),
    );
  }
}
