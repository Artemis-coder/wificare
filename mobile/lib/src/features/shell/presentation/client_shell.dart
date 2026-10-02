import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';

/// Coquille de l'espace client.
///
/// Remplace le `Tabs` d'Expo Router : la barre d'onglets reste affichée sur
/// toutes les pages de l'espace client (tableau de bord, liste et détail des
/// pannes, formulaire de signalement, factures, profil).
class ClientShell extends StatelessWidget {
  const ClientShell({
    required this.navigation,
    required this.location,
    required this.onSelectTab,
    super.key,
  });

  /// Contenu de l'onglet courant, rendu par le shell d'onglets.
  final StatefulNavigationShell navigation;

  /// URL affichée : détermine l'onglet actif (une page enfant comme
  /// `/home/tickets/new` doit rester sur l'onglet « Pannes »).
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
                branches: ClientTab.branches,
              ),
            );
          },
          destinations: [
            for (final tab in ClientTab.tabs)
              NavigationDestination(
                icon: Icon(tab.icon),
                label: tab.label,
              ),
          ],
        ),
      ),
    );
  }

  static int _indexFor(String location) {
    if (location.startsWith(Routes.tickets)) {
      return ClientTab.branches.indexOf('tickets');
    }

    if (location.startsWith(Routes.reviews)) {
      return ClientTab.branches.indexOf('reviews');
    }
    if (location.startsWith(Routes.equipments)) {
      return ClientTab.branches.indexOf('equipments');
    }
    if (location.startsWith(Routes.invoices)) {
      return ClientTab.branches.indexOf('invoices');
    }
    if (location.startsWith(Routes.profile)) {
      // Le profil est une page enfant de l'accueil : l'onglet « Accueil »
      // reste actif quand il est ouvert.
      return ClientTab.branches.indexOf('dashboard');
    }

    return ClientTab.branches.indexOf('dashboard');
  }
}
