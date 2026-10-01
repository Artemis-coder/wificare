import '../../../core/domain/models.dart';
import '../../../core/network/api_client.dart';

/// Zones Wi-Fi et équipements du client connecté.
class ZoneRepository {
  ZoneRepository(this._api);

  final ApiClient _api;

  Future<List<WifiZone>> zones(String clientId) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/wifi-zones',
      query: {'clientId': clientId},
    );

    return (response['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(WifiZone.fromJson)
        .toList();
  }

  /// Ajout d'une zone Wi-Fi au dossier du propriétaire connecté.
  ///
  /// Le serveur déduit le dossier client du jeton : un propriétaire peut donc
  /// gérer plusieurs zones.
  Future<WifiZone> createZone({
    required String name,
    String? location,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/wifi-zones',
      data: {
        'name': name,
        if (location != null && location.isNotEmpty) 'location': location,
      },
    );

    return WifiZone.fromJson(response['data'] as Map<String, dynamic>);
  }

  /// Enregistre la position du client comme destination de la zone.
  ///
  /// C'est ce point qui rend l'estimation d'arrivée calculable : sans lui, le
  /// serveur sait où est le technicien mais pas où il va. Le relevé se fait
  /// depuis le téléphone du client, qui est physiquement sur place — d'où une
  /// position juste, sans avoir à deviner une adresse saisie en texte libre.
  Future<void> shareLocation(
    String wifiZoneId, {
    required double latitude,
    required double longitude,
  }) async {
    await _api.patch<Map<String, dynamic>>(
      '/wifi-zones/$wifiZoneId/location',
      data: {'latitude': latitude, 'longitude': longitude},
    );
  }

  Future<List<Equipment>> equipments(String wifiZoneId) async {
    final response = await _api.get<Map<String, dynamic>>(
      '/wifi-zones/$wifiZoneId/equipments',
    );

    return (response['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Equipment.fromJson)
        .toList();
  }

  Future<Equipment> createEquipment(
    String wifiZoneId, {
    required String type,
    String? brand,
    String? model,
    String? serialNumber,
  }) async {
    final response = await _api.post<Map<String, dynamic>>(
      '/wifi-zones/$wifiZoneId/equipments',
      data: {
        'type': type,
        if (brand != null && brand.isNotEmpty) 'brand': brand,
        if (model != null && model.isNotEmpty) 'model': model,
        if (serialNumber != null && serialNumber.isNotEmpty) 'serialNumber': serialNumber,
      },
    );

    return Equipment.fromJson(response['data'] as Map<String, dynamic>);
  }
}
