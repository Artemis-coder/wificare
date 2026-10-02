import 'package:flutter/material.dart';

import 'json_x.dart';

/// Énumérations du domaine, partagées entre les features (tickets, factures,
/// paiement). Les valeurs correspondent exactement aux enums Prisma.
enum UserRole {
  superAdmin('SUPER_ADMIN', 'Super administrateur'),
  technician('TECHNICIAN', 'Technicien'),
  client('CLIENT', 'Propriétaire de zone');

  const UserRole(this.wire, this.label);
  final String wire;
  final String label;

  static UserRole fromWire(String? value) => UserRole.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => UserRole.client,
  );
}

/// Statut de validation d'une Wi-Fi Zone.
///
/// Une zone déclarée par son propriétaire attend la validation du super
/// administrateur avant d'entrer dans le parc exploité.
enum ZoneStatus {
  pending('PENDING', 'En attente de validation', '#F59E0B'),
  active('ACTIVE', 'Validée', '#22C55E');

  const ZoneStatus(this.wire, this.label, this.colorHex);
  final String wire;
  final String label;
  final String colorHex;

  Color get color => JsonX.hexColor(colorHex);

  static ZoneStatus fromWire(String? value) => ZoneStatus.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => ZoneStatus.active,
  );
}

enum UserStatus {
  active('ACTIVE', 'Actif'),
  inactive('INACTIVE', 'Inactif'),
  suspended('SUSPENDED', 'Suspendu');

  const UserStatus(this.wire, this.label);
  final String wire;
  final String label;

  static UserStatus fromWire(String? value) => UserStatus.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => UserStatus.active,
  );
}

enum Priority {
  low('LOW', 'Faible', '#22C55E'),
  normal('NORMAL', 'Normal', '#3B82F6'),
  high('HIGH', 'Élevé', '#F59E0B'),
  urgent('URGENT', 'Urgent', '#EF4444');

  const Priority(this.wire, this.label, this.colorHex);
  final String wire;
  final String label;
  final String colorHex;

  Color get color => JsonX.hexColor(colorHex);

  static Priority fromWire(String? value) => Priority.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => Priority.normal,
  );
}

enum TicketStatus {
  created('NEW', 'Nouveau', '#6B7280'),
  toVerify('TO_VERIFY', 'À vérifier', '#3B82F6'),
  assigned('ASSIGNED', 'Affecté', '#8B5CF6'),
  confirmed('CONFIRMED', 'Rendez-vous confirmé', '#06B6D4'),
  enRoute('EN_ROUTE', 'En route', '#F59E0B'),
  diagnosing('DIAGNOSING', 'En diagnostic', '#F97316'),
  pendingQuote('PENDING_QUOTE', 'Devis en attente', '#EAB308'),
  repairing('REPAIRING', 'En réparation', '#EF4444'),
  completed('COMPLETED', 'Terminé', '#22C55E'),
  pendingPayment('PENDING_PAYMENT', 'Paiement en attente', '#F59E0B'),
  closed('CLOSED', 'Clôturé', '#10B981'),
  canceled('CANCELED', 'Annulé', '#EF4444');

  const TicketStatus(this.wire, this.label, this.colorHex);
  final String wire;
  final String label;
  final String colorHex;

  Color get color => JsonX.hexColor(colorHex);

  static TicketStatus fromWire(String? value) => TicketStatus.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => TicketStatus.created,
  );

  /// Étapes affichées dans le suivi de progression côté client.
  ///
  /// Le devis n'y figure que si la demande en porte un : c'est une étape
  /// facultative, puisqu'un diagnostic peut être réparé sans devis. L'afficher
  /// systématiquement laisserait le client devant un « Devis en attente » qui
  /// n'arrivera jamais ; l'omettre, lui, cachait complètement le devis envoyé.
  /// La demande portant un devis est donc la seule à voir l'étape apparaître.
  static List<TicketStatus> clientProgressSteps({required bool hasQuote}) => [
    TicketStatus.created,
    TicketStatus.assigned,
    TicketStatus.enRoute,
    TicketStatus.diagnosing,
    if (hasQuote) TicketStatus.pendingQuote,
    TicketStatus.repairing,
    TicketStatus.completed,
  ];

  /// Transitions autorisées côté technicien (machine à états).
  static List<TicketStatus> transitionsFrom(TicketStatus current) {
    switch (current) {
      case TicketStatus.created:
        return const [TicketStatus.toVerify, TicketStatus.assigned, TicketStatus.canceled];
      case TicketStatus.toVerify:
        return const [TicketStatus.assigned, TicketStatus.canceled];
      case TicketStatus.assigned:
        return const [
          TicketStatus.confirmed,
          TicketStatus.enRoute,
          TicketStatus.canceled,
        ];
      case TicketStatus.confirmed:
        return const [TicketStatus.enRoute, TicketStatus.canceled];
      case TicketStatus.enRoute:
        return const [TicketStatus.diagnosing, TicketStatus.canceled];
      case TicketStatus.diagnosing:
        return const [TicketStatus.pendingQuote, TicketStatus.repairing];
      case TicketStatus.pendingQuote:
        return const [TicketStatus.repairing, TicketStatus.canceled];
      case TicketStatus.repairing:
        return const [
          TicketStatus.completed,
          TicketStatus.pendingQuote,
          TicketStatus.canceled,
        ];
      case TicketStatus.completed:
        return const [TicketStatus.pendingPayment];
      case TicketStatus.pendingPayment:
        return const [TicketStatus.closed];
      case TicketStatus.closed:
      case TicketStatus.canceled:
        return const [];
    }
  }

  /// Index dans le suivi client, ou -1 si le statut n'y figure pas.
  ///
  /// La liste dépend de la demande : `steps` doit être celle réellement
  /// affichée, sinon un devis présent compterait pour une étape absente.
  int progressIndex(List<TicketStatus> steps) => steps.indexOf(this);

  bool get isOpen =>
      this != TicketStatus.closed && this != TicketStatus.canceled;

  bool get isTerminal =>
      this == TicketStatus.closed ||
      this == TicketStatus.canceled ||
      this == TicketStatus.completed;
}

enum FileType {
  image('IMAGE', 'Image'),
  video('VIDEO', 'Vidéo'),
  audio('AUDIO', 'Audio'),
  document('DOCUMENT', 'Document');

  const FileType(this.wire, this.label);
  final String wire;
  final String label;

  static FileType fromWire(String? value) => FileType.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => FileType.document,
  );
}

enum DocumentType {
  quote('QUOTE', 'Devis'),
  invoice('INVOICE', 'Facture');

  const DocumentType(this.wire, this.label);
  final String wire;
  final String label;

  static DocumentType fromWire(String? value) => DocumentType.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => DocumentType.invoice,
  );
}

enum DocumentStatus {
  draft('DRAFT', 'Brouillon'),
  sent('SENT', 'Envoyé'),
  accepted('ACCEPTED', 'Accepté'),
  rejected('REJECTED', 'Refusé'),
  paid('PAID', 'Payé');

  const DocumentStatus(this.wire, this.label);
  final String wire;
  final String label;

  static DocumentStatus fromWire(String? value) => DocumentStatus.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => DocumentStatus.draft,
  );
}

enum PaymentChannel {
  cash('CASH', 'Espèces'),
  mobileMoney('MOBILE_MONEY', 'Mobile Money'),
  bankTransfer('BANK_TRANSFER', 'Virement bancaire');

  const PaymentChannel(this.wire, this.label);
  final String wire;
  final String label;

  static PaymentChannel fromWire(String? value) => PaymentChannel.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => PaymentChannel.cash,
  );
}

/// Opérateur du paiement mobile.
///
/// Wave, Orange et MTN ne sont pas équivalents : c'est l'opérateur qui permet
/// de rapprocher une transaction du règlement, et un client qui paie chez Orange
/// ne peut pas être rapproché d'un paiement Wave.
enum MobileMoneyOperator {
  wave('WAVE', 'Wave', Color(0xFF1CA6F4)),
  orange('ORANGE', 'Orange', Color(0xFFFF7900)),
  mtn('MTN', 'MTN', Color(0xFFFFCC00));

  const MobileMoneyOperator(this.wire, this.label, this.color);

  final String wire;
  final String label;
  final Color color;

  static MobileMoneyOperator? fromWire(String? value) {
    if (value == null) return null;

    for (final operator in MobileMoneyOperator.values) {
      if (operator.wire == value) return operator;
    }

    return null;
  }
}

enum PaymentStatus {
  pending('PENDING', 'En attente'),
  completed('COMPLETED', 'Terminé'),
  failed('FAILED', 'Échoué'),
  refunded('REFUNDED', 'Remboursé');

  const PaymentStatus(this.wire, this.label);
  final String wire;
  final String label;

  static PaymentStatus fromWire(String? value) => PaymentStatus.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => PaymentStatus.pending,
  );
}

/// Types de demande proposés au client lors de la création d'un ticket.
enum TicketCategory {
  outage(
    'Panne totale',
    'Plus aucun accès à Internet',
    Icons.wifi_off_rounded,
  ),
  slow(
    'Lenteur / Instabilité',
    'Connexion coupée ou très lente',
    Icons.speed_rounded,
  ),
  installation(
    'Nouvelle installation',
    'Raccordement d\'un nouvel équipement',
    Icons.router_rounded,
  ),
  startup(
    'Démarrage équipement',
    'Un équipement ne s\'allume plus',
    Icons.power_settings_new_rounded,
  ),
  other(
    'Autre demande',
    'Précisez la situation dans la description',
    Icons.more_horiz_rounded,
  );

  const TicketCategory(this.label, this.description, this.icon);
  final String label;
  final String description;
  final IconData icon;
}

/// Nature d'une notification in-app.
enum AppNotificationType {
  ticketSubmitted('TICKET_SUBMITTED', Icons.campaign_outlined),
  ticketAssigned('TICKET_ASSIGNED', Icons.assignment_ind_outlined),
  ticketStatusChanged('TICKET_STATUS_CHANGED', Icons.sync_alt_rounded),
  ticketCanceled('TICKET_CANCELED', Icons.cancel_outlined),
  quoteSent('QUOTE_SENT', Icons.request_quote_outlined),
  quoteAccepted('QUOTE_ACCEPTED', Icons.check_circle_outline_rounded),
  quoteRejected('QUOTE_REJECTED', Icons.cancel_outlined),
  zoneValidated('ZONE_VALIDATED', Icons.verified_outlined),
  zoneDeleted('ZONE_DELETED', Icons.delete_outline_rounded);

  const AppNotificationType(this.wire, this.icon);

  final String wire;
  final IconData icon;

  static AppNotificationType fromWire(String? value) =>
      AppNotificationType.values.firstWhere(
        (type) => type.wire == value,
        orElse: () => AppNotificationType.ticketStatusChanged,
      );
}
