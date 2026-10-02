import 'dart:io';

import 'package:dio/dio.dart';

/// Erreur normalisée de l'API, utilisable directement par la couche UI.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.details});

  final String message;
  final int? statusCode;
  final Object? details;

  bool get isUnauthorized => statusCode == 401;
  bool get isNetworkError => statusCode == null;

  factory ApiException.fromDio(DioException error) {
    final status = error.response?.statusCode;

    final data = error.response?.data;
    String? serverMessage;
    if (data is Map<String, dynamic>) {
      final raw = data['error'] ?? data['message'];
      if (raw is String && raw.trim().isNotEmpty) serverMessage = raw;
    }

    final message = switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout => 'Le serveur met trop de temps à répondre.',
      DioExceptionType.connectionError =>
        'Impossible de joindre le serveur. Vérifiez votre connexion.',
      DioExceptionType.badResponse => serverMessage ?? 'Erreur serveur (${status ?? '?'}).',
      DioExceptionType.cancel => 'Requête annulée.',
      DioExceptionType.unknown =>
        error.error is SocketException
            ? 'Impossible de joindre le serveur. Vérifiez votre connexion.'
            : (serverMessage ?? 'Une erreur inattendue est survenue.'),
      _ => serverMessage ?? 'Une erreur inattendue est survenue.',
    };

    return ApiException(message, statusCode: status, details: data);
  }

  @override
  String toString() => 'ApiException($statusCode): $message';
}
