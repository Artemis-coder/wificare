import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../utils/phone_countries.dart';
import '../utils/phone_country_data.dart';

/// Sélecteur de pays posé devant un champ de numéro.
///
/// Le choix se fait dans une feuille modale : 245 pays ne se parcourent pas dans
/// un menu déroulant, et le champ de recherche qui les trie est ce qui les rend
/// atteignables en deux frappes — « ci », « 225 », « sn ».
///
/// Le widget ne pose que le drapeau et l'indicatif : c'est ce que l'utilisateur
/// reconnaît de son numéro, et le nom complet n'a pas sa place dans un champ de
/// saisie qui doit laisser la place aux chiffres.
class PhoneCountryPicker extends StatelessWidget {
  const PhoneCountryPicker({
    required this.country,
    required this.onChanged,
    this.enabled = true,
    super.key,
  });

  final PhoneCountryData country;
  final ValueChanged<PhoneCountryData> onChanged;
  final bool enabled;

  Future<void> _choose(BuildContext context) async {
    final chosen = await showModalBottomSheet<PhoneCountryData>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      builder: (sheetContext) => _CountrySheet(selected: country),
    );

    // Une feuille fermée sans choix rend `null` : ne rien changer vaut mieux que
    // de retomber sur le pays par défaut.
    if (chosen != null) onChanged(chosen);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Semantics(
      button: true,
      label: 'Pays du numéro : ${country.name}',
      child: InkWell(
        onTap: enabled ? () => _choose(context) : null,
        borderRadius: const BorderRadius.horizontal(
          left: Radius.circular(AppRadius.sm),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.sm,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(country.flag, style: const TextStyle(fontSize: 20)),
              const SizedBox(width: AppSpacing.xs),
              Text(
                country.dialLabel,
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Icon(
                Icons.arrow_drop_down_rounded,
                size: 20,
                color: colors.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Retire la casse et les accents d'une recherche.
///
/// « sen » doit trouver « Sénégal » : les lettres sans accent sont ce que
/// l'utilisateur tape sur un clavier où il n'en a pas besoin, et un pays
/// introuvable est un pays qu'il croira absent de la liste.
String _fold(String value) => value
    .toLowerCase()
    .replaceAll('à', 'a')
    .replaceAll('â', 'a')
    .replaceAll('ç', 'c')
    .replaceAll('é', 'e')
    .replaceAll('è', 'e')
    .replaceAll('ê', 'e')
    .replaceAll('ë', 'e')
    .replaceAll('î', 'i')
    .replaceAll('ï', 'i')
    .replaceAll('ô', 'o')
    .replaceAll('ö', 'o')
    .replaceAll('ù', 'u')
    .replaceAll('û', 'u')
    .replaceAll('ü', 'u')
    .replaceAll('ñ', 'n');

/// Liste des pays, cherchable, dans une feuille modale.
class _CountrySheet extends StatefulWidget {
  const _CountrySheet({required this.selected});

  final PhoneCountryData selected;

  @override
  State<_CountrySheet> createState() => _CountrySheetState();
}

class _CountrySheetState extends State<_CountrySheet> {
  final TextEditingController _query = TextEditingController();
  String _search = '';

  /// Une recherche porte sur le nom, sur l'indicatif et sur les lettres du code
  /// pays : « sen », « 221 » et « sn » mènent tous au Sénégal, et quelqu'un qui
  /// connaît l'un des trois ne connaît pas forcément les autres.
  List<PhoneCountryData> get _results {
    final search = _fold(_search);

    if (search.isEmpty) return PhoneCountries.all;

    return PhoneCountries.all.where((country) {
      return _fold(country.name).contains(search) ||
          country.dial.contains(search) ||
          _fold(country.code).contains(search);
    }).toList();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final results = _results;
    final keyboard = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: SafeArea(
        child: SizedBox(
          // La feuille occupe les deux tiers de l'écran : la liste doit rester
          // visible pendant que l'on cherche, pas disparaître derrière le
          // clavier de recherche.
          height: MediaQuery.of(context).size.height * 2 / 3,
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.md),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.outlineVariant,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: TextField(
                  controller: _query,
                  autofocus: true,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Rechercher un pays ou un indicatif',
                    prefixIcon: Icon(
                      Icons.search_rounded,
                      color: colors.onSurfaceVariant,
                    ),
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                  onChanged: (value) => setState(() => _search = value),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: results.isEmpty
                    ? Center(
                        child: Text(
                          'Aucun pays ne correspond.',
                          style: TextStyle(color: colors.onSurfaceVariant),
                        ),
                      )
                    : ListView.builder(
                        itemCount: results.length,
                        itemBuilder: (context, index) {
                          final country = results[index];
                          final isSelected = country.code == widget.selected.code;

                          return ListTile(
                            onTap: () => Navigator.of(context).pop(country),
                            selected: isSelected,
                            selectedTileColor: colors.primary.withValues(
                              alpha: 0.08,
                            ),
                            leading: Text(
                              country.flag,
                              style: const TextStyle(fontSize: 24),
                            ),
                            title: Text(country.name),
                            subtitle: Text(
                              country.dialLabel,
                              style: TextStyle(
                                color: colors.onSurfaceVariant,
                                fontSize: 12,
                              ),
                            ),
                            trailing: isSelected
                                ? Icon(
                                    Icons.check_rounded,
                                    color: colors.primary,
                                  )
                                : null,
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}