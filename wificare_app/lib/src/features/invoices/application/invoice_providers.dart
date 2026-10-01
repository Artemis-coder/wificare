import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/infra_providers.dart';
import '../data/invoice_repository.dart';

final invoiceRepositoryProvider = Provider<InvoiceRepository>(
  (ref) => InvoiceRepository(ref.watch(apiClientProvider)),
);
