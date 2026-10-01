import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/env.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Client HTTP unique de l'application.
///
/// Équivalent du `ApiClient` axios de l'application React Native, avec deux
/// corrections : le rafraîchissement du jeton est truly single-flight (une seule
/// requête à la fois, les autres attendent), et une session expirée déclenche
/// un callback qui renvoie l'utilisateur vers l'écran de connexion.
class ApiClient {
  ApiClient({required this.tokenStorage, Dio? dio, Dio? refreshDio})
    : _dio = dio ?? Dio(),
      _refreshDio = refreshDio ?? Dio() {
    _dio.options = _dio.options.copyWith(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      headers: {'Accept': 'application/json'},
    );

    _refreshDio.options = _refreshDio.options.copyWith(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      headers: {'Accept': 'application/json'},
    );

    _dio.interceptors.add(
      InterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }

  final Dio _dio;
  final Dio _refreshDio;
  final TokenStorage tokenStorage;

  Future<bool>? _refreshing;

  /// Appelé quand la session ne peut plus être rafraîchie.
  void Function()? onSessionExpired;

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await tokenStorage.readAccessToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(DioException error, ErrorInterceptorHandler handler) async {
    final request = error.requestOptions;
    final isAuthCall = request.path.contains('/auth/login') ||
        request.path.contains('/auth/refresh');

    if (error.response?.statusCode != 401 || isAuthCall) {
      handler.next(error);
      return;
    }

    try {
      final refreshed = await _refreshTokens();
      if (!refreshed) {
        await _expireSession();
        handler.reject(
          DioException(
            requestOptions: request,
            response: error.response,
            type: DioExceptionType.badResponse,
            error: const ApiException('Session expirée'),
          ),
        );
        return;
      }

      final token = await tokenStorage.readAccessToken();
      request.headers['Authorization'] = 'Bearer $token';

      final response = await _dio.fetch<dynamic>(request);
      handler.resolve(response);
    } on DioException catch (e) {
      await _expireSession();
      handler.next(e);
    }
  }

  /// Une seule requête de rafraîchissement à la fois : les appels concurrents
  /// partagent le même `Future`.
  Future<bool> _refreshTokens() {
    return _refreshing ??= _performRefresh().whenComplete(() {
      _refreshing = null;
    });
  }

  Future<bool> _performRefresh() async {
    final refreshToken = await tokenStorage.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return false;

    try {
      final response = await _refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      final data = response.data?['data'] as Map<String, dynamic>?;
      final accessToken = data?['accessToken'] as String?;
      final newRefreshToken = data?['refreshToken'] as String?;

      if (accessToken == null || newRefreshToken == null) return false;

      await tokenStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: newRefreshToken,
      );
      return true;
    } on DioException catch (error) {
      debugPrint('Refresh token failed: ${error.message}');
      return false;
    }
  }

  Future<void> _expireSession() async {
    await tokenStorage.clear();
    onSessionExpired?.call();
  }

  Dio get raw => _dio;

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) async {
    try {
      final response = await _dio.get<T>(path, queryParameters: query);
      return response.data as T;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<T> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    Options? options,
  }) async {
    try {
      final response = await _dio.post<T>(
        path,
        data: data,
        queryParameters: query,
        options: options,
      );
      return response.data as T;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<T> patch<T>(String path, {Object? data}) async {
    try {
      final response = await _dio.patch<T>(path, data: data);
      return response.data as T;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
