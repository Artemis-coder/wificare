import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';

/// Coquille de l'espace technicien.
///
/// Le technicien a quatre sections : l'accueil et ses interventions, le
/// portefeuille de ses encaissements, et les avis que les clients ont laissés
/// sur son travail. Ni zones, ni équipements, ni factures : ce sont des affaires
/// de propriétaire de zone. Le profil s'ouvre depuis l'avatar de l'accueil.
///
/// Les quatre sont des choses qu'il vient chercher, pas des places dans un
/// formulaire : une section absente de la barre n'existe pas pour celui qui
/// ouvrait l'application sans savoir qu'elle est là.
class TechnicianShell extends StatelessWidget {
  const TechnicianShell({
    required this.navigation,
    required this.location,
    required this.onSelectTab,
    super.key,
  });

  final StatefulNavigationShell navigation;
  final String location;
  final void Function(int index, {bool initialLocation}) onSelectTab;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final selectedIndex = _indexFor(location);

    return Scaffold(
      body: navigation,
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.outlineVariant)),
        ),
        child: NavigationBar(
          selectedIndex: selectedIndex,
          onDestinationSelected: (index) {
            onSelectTab(
              index,
              initialLocation: shouldGoToTabRoot(
                index: index,
                selectedIndex: selectedIndex,
                branches: TechnicianRoutes.branches,
              ),
            );
          },
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_rounded),
              label: 'Accueil',
            ),
            NavigationDestination(
              icon: Icon(Icons.assignment_outlined),
              label: 'Demandes',
            ),
            NavigationDestination(
              icon: Icon(Icons.account_balance_wallet_outlined),
              label: 'Portefeuille',
            ),
            NavigationDestination(
              icon: Icon(Icons.star_outline_rounded),
              label: 'Avis',
            ),
          ],
        ),
      ),
    );
  }

  static int _indexFor(String location) {
    if (location.startsWith('/tech/tickets')) return 1;
    if (location.startsWith('/tech/wallet')) return 2;
    if (location.startsWith('/tech/reviews')) return 3;
    return 0;
  }
}
