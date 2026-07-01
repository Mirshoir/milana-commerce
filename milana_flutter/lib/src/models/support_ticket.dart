class SupportTicket {
  const SupportTicket({
    required this.name,
    required this.phone,
    required this.topic,
    required this.message,
    this.email = '',
    this.customerId,
  });

  final String name;
  final String phone;
  final String email;
  final String topic;
  final String message;
  final String? customerId;

  Map<String, dynamic> toBackendJson() => {
    'name': name,
    'phone': phone,
    'email': email,
    'topic': topic,
    'message': message,
    'lang': 'uz',
  };

  Map<String, dynamic> toFunctionJson() => {
    'name': name,
    'phone': phone,
    'email': email,
    'topic': topic,
    'message': message,
    'lang': 'uz',
  };

  Map<String, dynamic> toFirestore(String number) => {
    'number': number,
    'customer_id': customerId,
    'name': name,
    'phone': phone,
    'email': email,
    'topic': topic,
    'message': message,
    'status': 'new',
    'lang': 'uz',
    'created_at': DateTime.now().toUtc().toIso8601String(),
    'updated_at': DateTime.now().toUtc().toIso8601String(),
  };
}

class SupportTicketSummary {
  const SupportTicketSummary({
    required this.number,
    required this.topic,
    required this.message,
    required this.status,
    required this.createdAt,
    this.reply = '',
    this.repliedAt,
  });

  final String number;
  final String topic;
  final String message;
  final String status;
  final DateTime? createdAt;
  final String reply;
  final DateTime? repliedAt;

  factory SupportTicketSummary.fromMap(Map<String, dynamic> data) {
    return SupportTicketSummary(
      number: '${data['number'] ?? ''}',
      topic: '${data['topic'] ?? 'general'}',
      message: '${data['message'] ?? ''}',
      status: '${data['status'] ?? 'new'}',
      createdAt: DateTime.tryParse('${data['created_at'] ?? ''}'),
      reply: '${data['reply'] ?? ''}',
      repliedAt: DateTime.tryParse('${data['replied_at'] ?? ''}'),
    );
  }
}
