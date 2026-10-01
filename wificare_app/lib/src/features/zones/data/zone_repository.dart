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
