import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/client/presentation/dashboard_screen.dart';
import '../../features/client/presentation/equipments_screen.dart';
import '../../features/client/presentation/profile_screen.dart';
import '../../features/invoices/presentation/invoice_detail_screen.dart';
import '../../features/invoices/presentation/invoices_screen.dart';
import '../../features/reviews/presentation/reviews_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/shell/presentation/client_shell.dart';
import '../../features/tickets/presentation/ticket_detail_screen.dart';
import '../../features/tickets/presentation/ticket_new_screen.dart';
import '../../features/tickets/presentation/tickets_list_screen.dart';
import '../../features/technician/presentation/technician_dashboard_screen.dart';
import '../../features/technician/presentation/technician_profile_screen.dart';
import '../../features/technician/presentation/technician_shell.dart';
import '../../features/technician/presentation/technician_ticket_screen.dart';
import '../../features/technician/presentation/technician_tickets_screen.dart';
import '../domain/enums.dart';
import '../providers/infra_providers.dart';
import '../widgets/app_logo.dart';

abstract final class Routes {
  static const splash = '/';
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

  static const List<String> branches = ['dashboard', 'tickets'];
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
    routes: [
      GoRoute(
        path: Routes.splash,
        builder: (_, _) => const _SplashScreen(),
      ),
      GoRoute(
        path: Routes.login,
        builder: (_, _) => const LoginScreen(),
      ),
      GoRoute(
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
                path: Routes.dashboard,
                builder: (_, _) => const DashboardScreen(),
                routes: [
                  GoRoute(
                    path: 'profile',
                    builder: (_, _) => const ProfileScreen(),
                  ),
                  GoRoute(
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
                path: Routes.tickets,
                builder: (_, _) => const TicketsListScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (_, _) => const TicketNewScreen(),
                  ),
                  GoRoute(
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
                path: Routes.equipments,
                builder: (_, _) => const EquipmentsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.invoices,
                builder: (_, _) => const InvoicesScreen(),
                routes: [
                  GoRoute(
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
                path: TechnicianRoutes.dashboard,
                builder: (_, _) => const TechnicianDashboardScreen(),
                routes: [
                  GoRoute(
                    path: 'profile',
                    builder: (_, _) => const TechnicianProfileScreen(),
                  ),
                  GoRoute(
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
                path: TechnicianRoutes.tickets,
                builder: (_, _) => const TechnicianTicketsScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => TechnicianTicketScreen(
                      ticketId: state.pathParameters['id']!,
                    ),
                  ),
                ],
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
