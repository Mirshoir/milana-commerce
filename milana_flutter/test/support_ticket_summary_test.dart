import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/support_ticket.dart';

void main() {
  test('support ticket summary reads manager reply metadata', () {
    final ticket = SupportTicketSummary.fromMap({
      'number': 'MS-2026-ABCD',
      'topic': 'payment',
      'message': 'To‘lov linkini yuboring.',
      'status': 'resolved',
      'reply': 'Payme link menejer tomonidan yuborildi.',
      'created_at': '2026-06-27T12:00:00.000Z',
      'replied_at': '2026-06-27T13:00:00.000Z',
    }, provenance: BackendProvenance.firebaseLegacy);

    expect(ticket.number, 'MS-2026-ABCD');
    expect(ticket.provenance, BackendProvenance.firebaseLegacy);
    expect(ticket.topic, 'payment');
    expect(ticket.status, 'resolved');
    expect(ticket.reply, 'Payme link menejer tomonidan yuborildi.');
    expect(ticket.createdAt, DateTime.utc(2026, 6, 27, 12));
    expect(ticket.repliedAt, DateTime.utc(2026, 6, 27, 13));
  });
}
