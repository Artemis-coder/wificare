import 'json_x.dart';
import 'enums.dart';

/// Entités du domaine, désérialisées à la frontière de l'API.
/// Deserialisation manuelle (sans build_runner) pour garder un build simple.

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    required this.status,
    this.firstName,
    this.lastName,
  });

  final String id;
  final String? name;
  final String phone;
  final UserRole role;
  final UserStatus status;

  /// Renseignés à la création de compte, absents pour les comptes historiques.
  final String? firstName;
  final String? lastName;

  String get displayName => (name == null || name!.isEmpty) ? phone : name!;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: JsonX.str(json['id']),
    name: JsonX.strOrNull(json['name']),
    phone: JsonX.str(json['phone']),
    role: UserRole.fromWire(JsonX.strOrNull(json['role'])),
    status: UserStatus.fromWire(JsonX.strOrNull(json['status'])),
    firstName: JsonX.strOrNull(json['firstName']),
    lastName: JsonX.strOrNull(json['lastName']),
  );
}

/// Types de compte proposés à l'inscription (`POST /auth/register`).
enum AccountType {
  technician('TECHNICIAN', 'Technicien', 'Intervenant du réseau'),
  wifiZoneOwner('WIFI_ZONE_OWNER', 'Propriétaire de zone', 'Gère une ou plusieurs zones');

  const AccountType(this.wire, this.label, this.description);

  /// Valeur attendue par l'API.
  final String wire;
  final String label;
  final String description;
}

class ClientAccount {
  const ClientAccount({
    required this.id,
    required this.name,
    required this.contact,
    required this.address,
    required this.userId,
    required this.zones,
  });

  final String id;
  final String name;
  final String contact;
  final String? address;
  final String? userId;
  final List<WifiZone> zones;

  factory ClientAccount.fromJson(Map<String, dynamic> json) => ClientAccount(
    id: JsonX.str(json['id']),
    name: JsonX.str(json['name']),
    contact: JsonX.str(json['contact']),
    address: JsonX.strOrNull(json['address']),
    userId: JsonX.strOrNull(json['userId']),
    zones: JsonX.list(json['wifiZones']).map(WifiZone.fromJson).toList(),
  );
}

class WifiZone {
  const WifiZone({
    required this.id,
    required this.clientId,
    required this.name,
    required this.location,
    required this.equipments,
    required this.latitude,
    required this.longitude,
  });

  final String id;
  final String clientId;
  final String name;
  final String location;
  final List<Equipment> equipments;

  /// Destination de l'intervention, relevée par le client. Absente tant qu'il ne
  /// l'a pas partagée : l'ETA n'est alors pas calculable.
  final double? latitude;
  final double? longitude;

  /// Les deux coordonnées doivent être présentes : une seule ne situe rien.
  bool get hasLocation => latitude != null && longitude != null;

  factory WifiZone.fromJson(Map<String, dynamic> json) => WifiZone(
    id: JsonX.str(json['id']),
    clientId: JsonX.str(json['clientId']),
    name: JsonX.str(json['name']),
    location: JsonX.str(json['location']),
    equipments: JsonX.list(json['equipments'])
        .map(Equipment.fromJson)
        .toList(),
    latitude: JsonX.decimalOrNull(json['latitude']),
    longitude: JsonX.decimalOrNull(json['longitude']),
  );
}

class Equipment {
  const Equipment({
    required this.id,
    required this.wifiZoneId,
    required this.type,
    required this.brand,
    required this.model,
    required this.serialNumber,
  });

  final String id;
  final String wifiZoneId;
  final String type;
  final String? brand;
  final String? model;
  final String? serialNumber;

  String get label => [brand, model].whereType<String>().where((e) => e.isNotEmpty).join(' ');

  factory Equipment.fromJson(Map<String, dynamic> json) => Equipment(
    id: JsonX.str(json['id']),
    wifiZoneId: JsonX.str(json['wifiZoneId']),
    type: JsonX.str(json['type']),
    brand: JsonX.strOrNull(json['brand']),
    model: JsonX.strOrNull(json['model']),
    serialNumber: JsonX.strOrNull(json['serialNumber']),
  );
}

class FileAttachment {
  const FileAttachment({
    required this.id,
    required this.url,
    required this.fileType,
    required this.createdAt,
  });

  final String id;
  final String url;
  final FileType fileType;
  final DateTime? createdAt;

  factory FileAttachment.fromJson(Map<String, dynamic> json) => FileAttachment(
    id: JsonX.str(json['id']),
    url: JsonX.str(json['url']),
    fileType: FileType.fromWire(JsonX.strOrNull(json['fileType'])),
    createdAt: JsonX.date(json['createdAt']),
  );
}

class Intervention {
  const Intervention({
    required this.id,
    required this.checklist,
    required this.diagnostic,
    required this.solution,
    required this.durationMin,
    required this.createdAt,
  });

  final String id;
  final Map<String, bool> checklist;
  final String? diagnostic;
  final String? solution;
  final int? durationMin;
  final DateTime? createdAt;

  factory Intervention.fromJson(Map<String, dynamic> json) => Intervention(
    id: JsonX.str(json['id']),
    checklist: JsonX.map(json['checklist']).map(
      (key, value) => MapEntry(key, JsonX.flag(value)),
    ),
    diagnostic: JsonX.strOrNull(json['diagnostic']),
    solution: JsonX.strOrNull(json['solution']),
    durationMin: JsonX.integerOrNull(json['durationMin']),
    createdAt: JsonX.date(json['createdAt']),
  );
}

class Ticket {
  const Ticket({
    required this.id,
    required this.reference,
    required this.type,
    required this.priority,
    required this.status,
    required this.description,
    required this.clientId,
    required this.wifiZoneId,
    required this.technicianId,
    required this.scheduledFor,
    required this.createdAt,
    required this.updatedAt,
    required this.client,
    required this.wifiZone,
    required this.technician,
    required this.files,
    required this.intervention,
    required this.quoteInvoice,
    required this.evaluation,
    required this.tracking,
  });

  final String id;
  final String reference;
  final String type;
  final Priority priority;
  final TicketStatus status;
  final String? description;
  final String clientId;
  final String wifiZoneId;
  final String? technicianId;
  final DateTime? scheduledFor;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final ClientAccount? client;
  final WifiZone? wifiZone;
  final AppUser? technician;
  final List<FileAttachment> files;
  final Intervention? intervention;
  final QuoteInvoice? quoteInvoice;
  final Evaluation? evaluation;
  /// Suivi de position du technicien en cours.
  ///
  /// `null` signifie « aucun suivi n'a jamais commencé », ce qui n'est pas la
  /// même chose qu'un suivi arrêté : le client peut alors proposer de le
  /// démarrer, alors qu'un suivi arrêté ne dépend plus que du technicien.
  final TicketTracking? tracking;

  String get zoneName => wifiZone?.name ?? 'Zone inconnue';
  String get zoneLocation => wifiZone?.location ?? '';

  factory Ticket.fromJson(Map<String, dynamic> json) => Ticket(
    id: JsonX.str(json['id']),
    reference: JsonX.str(json['reference']),
    type: JsonX.str(json['type']),
    priority: Priority.fromWire(JsonX.strOrNull(json['priority'])),
    status: TicketStatus.fromWire(JsonX.strOrNull(json['status'])),
    description: JsonX.strOrNull(json['description']),
    clientId: JsonX.str(json['clientId']),
    wifiZoneId: JsonX.str(json['wifiZoneId']),
    technicianId: JsonX.strOrNull(json['technicianId']),
    scheduledFor: JsonX.date(json['scheduledFor']),
    createdAt: JsonX.date(json['createdAt']),
    updatedAt: JsonX.date(json['updatedAt']),
    client: JsonX.mapOrNull(json['client']) == null
        ? null
        : ClientAccount.fromJson(JsonX.map(json['client'])),
    wifiZone: JsonX.mapOrNull(json['wifiZone']) == null
        ? null
        : WifiZone.fromJson(JsonX.map(json['wifiZone'])),
    technician: JsonX.mapOrNull(json['technician']) == null
        ? null
        : AppUser.fromJson(JsonX.map(json['technician'])),
    files: JsonX.list(json['files']).map(FileAttachment.fromJson).toList(),
    intervention: JsonX.mapOrNull(json['intervention']) == null
        ? null
        : Intervention.fromJson(JsonX.map(json['intervention'])),
    quoteInvoice: JsonX.mapOrNull(json['quoteInvoice']) == null
        ? null
        : QuoteInvoice.fromJson(JsonX.map(json['quoteInvoice'])),
    evaluation: JsonX.mapOrNull(json['evaluation']) == null
        ? null
        : Evaluation.fromJson(JsonX.map(json['evaluation'])),
    tracking: JsonX.mapOrNull(json['tracking']) == null
        ? null
        : TicketTracking.fromJson(JsonX.map(json['tracking'])),
  );
}

/// Position partagée par le technicien pendant son déplacement.
///
/// L'ETA est calculée par le serveur : le téléphone ne fait que l'afficher.
/// Deux raisons à cela — le même calcul ne doit pas donner deux chiffres
/// différents selon l'appareil, et le serveur connaît déjà la destination qu'il
/// a validée.
class TicketTracking {
  const TicketTracking({
    required this.active,
    required this.etaMinutes,
    required this.distanceMeters,
    required this.recordedAt,
    required this.technicianName,
  });

  /// Le technicien partage-t-il encore sa position ?
  final bool active;

  /// Arrivée estimée, en minutes. `null` quand la destination n'est pas
  /// connue : le client n'a pas encore partagé la position de sa zone. Aucun
  /// chiffre n'est deviné à la place.
  final int? etaMinutes;

  final int? distanceMeters;
  final DateTime? recordedAt;
  final String? technicianName;

  factory TicketTracking.fromJson(Map<String, dynamic> json) => TicketTracking(
    active: json['active'] == true,
    etaMinutes: JsonX.integerOrNull(json['etaMinutes']),
    distanceMeters: JsonX.integerOrNull(json['distanceMeters']),
    recordedAt: JsonX.date(json['recordedAt']),
    technicianName: JsonX.strOrNull(json['technicianName']),
  );
}

class InvoiceLine {
  const InvoiceLine({
    required this.id,
    required this.description,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
  });

  final String id;
  final String description;
  final int quantity;
  final double unitPrice;
  final double totalPrice;

  factory InvoiceLine.fromJson(Map<String, dynamic> json) => InvoiceLine(
    id: JsonX.str(json['id']),
    description: JsonX.str(json['description']),
    quantity: JsonX.integer(json['quantity'], fallback: 1),
    unitPrice: JsonX.decimal(json['unitPrice']),
    totalPrice: JsonX.decimal(json['totalPrice']),
  );
}

class QuoteInvoice {
  const QuoteInvoice({
    required this.id,
    required this.ticketId,
    required this.type,
    required this.status,
    required this.totalAmount,
    required this.notes,
    required this.createdAt,
    required this.lines,
    required this.payment,
    required this.ticket,
  });

  final String id;
  final String? ticketId;
  final DocumentType type;
  final DocumentStatus status;
  final double totalAmount;

  /// Observations libres du technicien, non facturées.
  final String? notes;

  final DateTime? createdAt;
  final List<InvoiceLine> lines;
  final Payment? payment;
  final Ticket? ticket;

  String get ticketReference => ticket?.reference ?? '—';
  String get clientName => ticket?.client?.name ?? '—';

  factory QuoteInvoice.fromJson(Map<String, dynamic> json) => QuoteInvoice(
    id: JsonX.str(json['id']),
    ticketId: JsonX.strOrNull(json['ticketId']),
    type: DocumentType.fromWire(JsonX.strOrNull(json['type'])),
    status: DocumentStatus.fromWire(JsonX.strOrNull(json['status'])),
    totalAmount: JsonX.decimal(json['totalAmount']),
    notes: JsonX.strOrNull(json['notes']),
    createdAt: JsonX.date(json['createdAt']),
    lines: JsonX.list(json['lines']).map(InvoiceLine.fromJson).toList(),
    payment: JsonX.mapOrNull(json['payment']) == null
        ? null
        : Payment.fromJson(JsonX.map(json['payment'])),
    ticket: JsonX.mapOrNull(json['ticket']) == null
        ? null
        : Ticket.fromJson(JsonX.map(json['ticket'])),
  );
}

class Payment {
  const Payment({
    required this.id,
    required this.amount,
    required this.channel,
    required this.operator,
    required this.reference,
    required this.transactionRef,
    required this.proofUrl,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final double amount;
  final PaymentChannel channel;

  /// Opérateur choisi pour un règlement Mobile Money, absent sinon.
  final MobileMoneyOperator? operator;

  final String? reference;
  final String? transactionRef;
  final String? proofUrl;
  final PaymentStatus status;
  final DateTime? createdAt;

  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
    id: JsonX.str(json['id']),
    amount: JsonX.decimal(json['amount']),
    channel: PaymentChannel.fromWire(JsonX.strOrNull(json['channel'])),
    operator: MobileMoneyOperator.fromWire(JsonX.strOrNull(json['operator'])),
    reference: JsonX.strOrNull(json['reference']),
    transactionRef: JsonX.strOrNull(json['transactionRef']),
    proofUrl: JsonX.strOrNull(json['proofUrl']),
    status: PaymentStatus.fromWire(JsonX.strOrNull(json['status'])),
    createdAt: JsonX.date(json['createdAt']),
  );
}

class Evaluation {
  const Evaluation({
    required this.id,
    required this.rating,
    required this.comment,
    required this.createdAt,
  });

  final String id;
  final int rating;
  final String? comment;
  final DateTime? createdAt;

  factory Evaluation.fromJson(Map<String, dynamic> json) => Evaluation(
    id: JsonX.str(json['id']),
    rating: JsonX.integer(json['rating']),
    comment: JsonX.strOrNull(json['comment']),
    createdAt: JsonX.date(json['createdAt']),
  );
}

/// Réponse paginée du backend : `{ data: { items, total, page, limit, totalPages } }`.
class Page<T> {
  const Page({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
    required this.totalPages,
  });

  final List<T> items;
  final int total;
  final int page;
  final int limit;
  final int totalPages;

  bool get hasMore => page < totalPages;
  int get nextPage => page + 1;

  static Page<T> fromJson<T>(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) parse,
  ) {
    final data = JsonX.map(json['data']);
    return Page<T>(
      items: JsonX.list(data['items']).map(parse).toList(),
      total: JsonX.integer(data['total']),
      page: JsonX.integer(data['page'], fallback: 1),
      limit: JsonX.integer(data['limit'], fallback: 20),
      totalPages: JsonX.integer(data['totalPages']),
    );
  }

  static Page<T> empty<T>(T Function(Map<String, dynamic>) parse) =>
      Page<T>(items: [], total: 0, page: 1, limit: 20, totalPages: 0);
}

/// Notification in-app adressée à un compte.
///
/// Le backend les persiste et l'application les relit : il n'y a pas de push,
/// ce qui évite de dépendre d'un service de messagerie externe.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.ticketId,
    required this.readAt,
    required this.createdAt,
  });

  final String id;
  final AppNotificationType type;
  final String title;
  final String body;

  /// Demande concernée : permet d'ouvrir directement le détail.
  final String? ticketId;

  final DateTime? readAt;
  final DateTime? createdAt;

  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
    id: JsonX.str(json['id']),
    type: AppNotificationType.fromWire(JsonX.strOrNull(json['type'])),
    title: JsonX.str(json['title']),
    body: JsonX.str(json['body']),
    ticketId: JsonX.strOrNull(json['ticketId']),
    readAt: JsonX.date(json['readAt']),
    createdAt: JsonX.date(json['createdAt']),
  );
}

/// Liste des notifications d'un compte et son nombre de non-lus.
class NotificationFeed {
  const NotificationFeed({required this.items, required this.unreadCount});

  final List<AppNotification> items;
  final int unreadCount;

  factory NotificationFeed.fromJson(Map<String, dynamic> json) =>
      NotificationFeed(
        items: JsonX.list(json['items'])
            .map((item) => AppNotification.fromJson(item))
            .toList(),
        unreadCount: JsonX.integer(json['unreadCount']),
      );

  /// Fusionne les notifications reçues par le flux temps réel.
  ///
  /// L'API ne les connaît pas encore : une notification arrivée en direct doit
  /// apparaître dans la liste sans attendre la prochaine lecture, et compter au
  /// badge. Celles déjà présentes sont ignorées — une notification lue depuis
  /// l'application peut revenir par le flux, et serait sinon comptée deux fois.
  NotificationFeed merge(List<AppNotification> live) {
    if (live.isEmpty) return this;

    final known = items.map((item) => item.id).toSet();

    final incoming = live.where((item) => !known.contains(item.id));

    if (incoming.isEmpty) return this;

    return NotificationFeed(
      items: [...incoming, ...items],
      unreadCount:
          unreadCount +
          incoming.where((item) => item.readAt == null).length,
    );
  }
}
