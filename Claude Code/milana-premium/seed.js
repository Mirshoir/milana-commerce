/* Fallback seed catalog — used only when the products table is empty.
   The running site normally uses imported Milana Premium catalog data. */
"use strict";

const P = [
  {
    slug: "catalog-local-01-staple-model-catalog-pdf-5-1-1016-1162",
    model_no: "1016",
    variant: "1162",
    gender: "women",
    category: "loungewear",
    name: "1016 / 1162",
    price: 7.3,
    old_price: null,
    sizes: ["44", "46", "48", "50", "52", "54"],
    images: ["/uploads/catalog-01-staple-model-catalog-p005-c001.jpg"],
    tag: "",
    rating: 4.8,
    reviews: 0,
    fabric: { en: "Women’s loungewear", ru: "Женский lounge", uz: "Ayollar lounge kiyimi" },
    desc: {
      en: "Real Milana Premium catalog model. Unit price is shown; wholesale order is calculated by bag.",
      ru: "Реальная модель из каталога Milana Premium. Указана цена за штуку; оптовый заказ считается мешками.",
      uz: "Milana Premium katalogidagi haqiqiy model. Kartada dona narxi ko‘rsatiladi; ulgurji buyurtma qop bo‘yicha hisoblanadi.",
    },
  },
  {
    slug: "catalog-local-01-staple-model-catalog-pdf-5-2-2061-1156",
    model_no: "2061",
    variant: "1156",
    gender: "women",
    category: "loungewear",
    name: "2061 / 1156",
    price: 6.8,
    old_price: null,
    sizes: ["44", "46", "48", "50", "52", "54"],
    images: ["/uploads/catalog-01-staple-model-catalog-p005-c002.jpg"],
    tag: "",
    rating: 4.8,
    reviews: 0,
    fabric: { en: "Women’s loungewear", ru: "Женский lounge", uz: "Ayollar lounge kiyimi" },
    desc: {
      en: "Real Milana Premium women’s catalog model.",
      ru: "Реальная женская модель из каталога Milana Premium.",
      uz: "Milana Premium ayollar katalogidagi haqiqiy model.",
    },
  },
  {
    slug: "catalog-local-01-staple-model-catalog-pdf-6-1-2045-1310",
    model_no: "2045",
    variant: "1310",
    gender: "women",
    category: "loungewear",
    name: "2045 / 1310",
    price: 6.3,
    old_price: null,
    sizes: ["44", "46", "48", "50", "52", "54"],
    images: ["/uploads/catalog-01-staple-model-catalog-p006-c001.jpg"],
    tag: "",
    rating: 4.8,
    reviews: 0,
    fabric: { en: "Women’s loungewear", ru: "Женский lounge", uz: "Ayollar lounge kiyimi" },
    desc: {
      en: "Real Milana Premium women’s catalog model.",
      ru: "Реальная женская модель из каталога Milana Premium.",
      uz: "Milana Premium ayollar katalogidagi haqiqiy model.",
    },
  },
  {
    slug: "catalog-local-02-milana-man-premium-collection-pdf-1-1-2116",
    model_no: "",
    variant: "2116",
    gender: "men",
    category: "loungewear",
    name: "2116",
    price: 7.8,
    old_price: null,
    sizes: ["46", "48", "50", "52", "54", "56"],
    images: ["/uploads/catalog-02-milana-man-premium-collection-p001-c001.jpg"],
    tag: "",
    rating: 4.8,
    reviews: 0,
    fabric: { en: "Milana Man Premium", ru: "Milana Man Premium", uz: "Milana Man Premium" },
    desc: {
      en: "Real model from the Milana Man Premium collection.",
      ru: "Реальная модель из коллекции Milana Man Premium.",
      uz: "Milana Man Premium kolleksiyasidagi haqiqiy model.",
    },
  },
  {
    slug: "catalog-local-02-milana-man-premium-collection-pdf-4-2-f-2043",
    model_no: "",
    variant: "F-2043",
    gender: "men",
    category: "loungewear",
    name: "F-2043",
    price: 5.5,
    old_price: null,
    sizes: ["46", "48", "50", "52", "54", "56"],
    images: ["/uploads/catalog-02-milana-man-premium-collection-p004-c002.jpg"],
    tag: "",
    rating: 4.8,
    reviews: 0,
    fabric: { en: "SUPREM · COTTON 100%", ru: "SUPREM · COTTON 100%", uz: "SUPREM · COTTON 100%" },
    desc: {
      en: "Real model from the Milana Man Premium collection.",
      ru: "Реальная модель из коллекции Milana Man Premium.",
      uz: "Milana Man Premium kolleksiyasidagi haqiqiy model.",
    },
  },
  {
    slug: "catalog-local-03-kindergarten-set-pdf-1-3-5100",
    model_no: "",
    variant: "5100",
    gender: "kids",
    category: "pajamas",
    name: "5100",
    price: 3.8,
    old_price: null,
    sizes: ["28", "30", "32", "34", "36", "38"],
    images: ["/uploads/catalog-03-kindergarten-set-p001-c003.jpg"],
    tag: "",
    rating: 4.8,
    reviews: 0,
    fabric: { en: "Kids kindergarten set", ru: "Детский комплект для садика", uz: "Bolalar bog‘cha komplekti" },
    desc: {
      en: "Real kids model from the Milana Premium kindergarten catalog.",
      ru: "Реальная детская модель из каталога Milana Premium для садика.",
      uz: "Milana Premium bog‘cha katalogidagi haqiqiy bolalar modeli.",
    },
  },
];

function seed(db) {
  const ins = db.prepare(`INSERT INTO products
    (slug, model_no, variant, gender, category, name,
     desc_en, desc_ru, desc_uz, fabric_en, fabric_ru, fabric_uz,
     price, old_price, sizes, images, tag, rating, reviews, active, sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`);
  P.forEach((p, i) => {
    ins.run(
      p.slug, p.model_no, p.variant, p.gender, p.category, p.name,
      p.desc.en, p.desc.ru, p.desc.uz,
      p.fabric.en, p.fabric.ru, p.fabric.uz,
      p.price, p.old_price, JSON.stringify(p.sizes), JSON.stringify(p.images),
      p.tag, p.rating, p.reviews, 1000 - i
    );
  });
}

module.exports = { products: P, seed };
