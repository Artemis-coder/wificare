import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';

/// Coquille de l'espace technicien.
///
/// Le technicien n'a que deux sections : ses interventions et les demandes
/// assignées. Ni zones, ni équipements, ni factures : ce sont des affaires de
/// propriétaire de zone. Le profil s'ouvre depuis l'avatar de l'accueil.
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
            onSelectTab(index, initialLocation: index == selectedIndex);
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
          ],
        ),
      ),
    );
  }

  static int _indexFor(String location) {
    if (location.startsWith('/tech/tickets')) return 1;
    return 0;
  }
}
