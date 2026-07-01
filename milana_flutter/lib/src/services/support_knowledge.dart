class SupportFaq {
  const SupportFaq({
    required this.id,
    required this.topic,
    required this.question,
    required this.answer,
    this.keywords = const [],
  });

  final String id;
  final String topic;
  final String question;
  final String answer;
  final List<String> keywords;
}

const milanaSupportPhone = '+998 50 155 10 10';
const milanaSupportPhoneCompact = '+998501551010';

const milanaSupportFaqs = [
  SupportFaq(
    id: 'products',
    topic: 'Katalog',
    question: 'Qanday mahsulotlar bor?',
    answer:
        'Asosan ayollar kiyimlari, shuningdek bolalar va erkaklar uchun xalat, pijama, tunika, sarochka va uy kiyimlari ishlab chiqaramiz.',
    keywords: ['mahsulot', 'kiyim', 'ayollar', 'erkaklar', 'bolalar'],
  ),
  SupportFaq(
    id: 'minimum-order',
    topic: 'Optom',
    question: 'Minimal buyurtma qancha?',
    answer:
        'Minimal buyurtma: 1 modeldan kamida 1 qop / meshok. Standart hisobda 1 qopda 60 ta kiyim bo‘ladi.',
    keywords: ['minimal', 'qop', 'meshok', 'optom', '60'],
  ),
  SupportFaq(
    id: 'bag-size',
    topic: 'Optom',
    question: '1 qop ichida o‘lchamlar qanday taqsimlanadi?',
    answer:
        'Standart qop: 60 ta kiyim. Odatda 6 ta o‘lcham bo‘ladi va har bir o‘lchamdan 10 tadan joylanadi.',
    keywords: ['razmer', 'o‘lcham', 'size', '10', '60'],
  ),
  SupportFaq(
    id: 'price',
    topic: 'Narx',
    question: 'Narx qanday hisoblanadi?',
    answer:
        'Kartochkada dona narxi ko‘rsatiladi. Buyurtmada 1 qop narxi = 60 × dona narxi. Aniq narx va mavjudlikni menejer tasdiqlaydi.',
    keywords: ['narx', 'price', 'dona', 'qop', 'total'],
  ),
  SupportFaq(
    id: 'delivery',
    topic: 'Yetkazib berish',
    question: 'Yetkazib berish bormi?',
    answer:
        'Ha, buyurtma pochta yoki Cargo orqali yuboriladi. Yetkazib berish xarajatini mijoz to‘laydi va narx/vaqt Cargo bilan kelishiladi.',
    keywords: ['delivery', 'yetkazib', 'cargo', 'pochta'],
  ),
  SupportFaq(
    id: 'address',
    topic: 'Manzil',
    question: 'Manzilingiz qayerda?',
    answer:
        'Manzil: O‘zbekiston, Andijon, Qoratut 605-uy. Andijon aeroportidan taxminan 500 metr masofada joylashganmiz.',
    keywords: ['manzil', 'andijon', 'qoratut', 'aeroport'],
  ),
  SupportFaq(
    id: 'hours',
    topic: 'Ish vaqti',
    question: 'Ish vaqtingiz qanday?',
    answer: 'Ish vaqti: Dushanba-Shanba, 08:00 dan 18:00 gacha.',
    keywords: ['ish vaqti', 'soat', 'working hours'],
  ),
  SupportFaq(
    id: 'payment',
    topic: 'To‘lov',
    question: 'To‘lov qanday qilinadi?',
    answer:
        'To‘lov usullarini menejer tushuntiradi. Buyurtma va to‘lovdan oldin $milanaSupportPhone raqami orqali tasdiqlang.',
    keywords: ['tolov', 'to‘lov', 'payme', 'click', 'bank', 'karta'],
  ),
  SupportFaq(
    id: 'defect',
    topic: 'Brak',
    question: 'Tovarda brak chiqsa nima bo‘ladi?',
    answer:
        'Agar tovardan brak chiqsa, fabrika pulini to‘laydi yoki boshqa tovar yuboradi. Holatni menejer bilan rasm/xabar orqali tasdiqlang.',
    keywords: ['brak', 'defect', 'qaytarish', 'almashtirish'],
  ),
  SupportFaq(
    id: 'availability',
    topic: 'Mavjudlik',
    question: 'Mahsulotlar doim mavjudmi?',
    answer:
        'Mahsulotlar limited edition, shuning uchun model mavjudligini buyurtmadan oldin aniqlashtirish kerak.',
    keywords: ['mavjud', 'stock', 'limited', 'ombor'],
  ),
];

List<SupportFaq> filterSupportFaqs(
  List<SupportFaq> faqs,
  String query, {
  int limit = 6,
}) {
  final normalized = query.trim().toLowerCase();
  final rows = normalized.isEmpty
      ? faqs
      : faqs.where((faq) {
          final haystack = [
            faq.topic,
            faq.question,
            faq.answer,
            ...faq.keywords,
          ].join(' ').toLowerCase();
          return haystack.contains(normalized);
        });
  return rows.take(limit).toList();
}
