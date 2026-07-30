"use strict";

const PHOTO_FACTS = require("../config/product-photo-facts.json").facts;

const TYPE_LABELS = {
  en: {
    tunic: "tunic", sarochka: "nightgown", robe: "robe", pajamas: "pajama set",
    set: "clothing set", tracksuit: "tracksuit", hoodie: "hoodie", dress: "dress",
    shirt: "shirt", polo: "polo shirt", trousers: "trousers", tshirt: "T-shirt",
    shorts: "shorts", top: "top",
  },
  ru: {
    tunic: "туника", sarochka: "сорочка", robe: "халат", pajamas: "пижама",
    set: "комплект", tracksuit: "спортивный костюм", hoodie: "худи", dress: "платье",
    shirt: "рубашка", polo: "поло", trousers: "штаны", tshirt: "футболка",
    shorts: "шорты", top: "майка",
  },
  uz: {
    tunic: "tunika", sarochka: "sarochka", robe: "xalat", pajamas: "pijama",
    set: "to‘plam", tracksuit: "sport kostyum", hoodie: "hudi", dress: "ko‘ylak",
    shirt: "ko‘ylak", polo: "polo", trousers: "ishton", tshirt: "futbolka",
    shorts: "shortik", top: "mayka",
  },
};

const FACT_LABELS = {
  color: {
    black: ["black", "чёрный", "qora"],
    white: ["white", "белый", "oq"],
    gray: ["gray", "серый", "kulrang"],
    beige: ["beige", "бежевый", "bej"],
    brown: ["brown", "коричневый", "jigarrang"],
    burgundy: ["burgundy", "бордовый", "bordo"],
    red: ["red", "красный", "qizil"],
    raspberry: ["raspberry", "малиновый", "malina rang"],
    pink: ["pink", "розовый", "pushti"],
    orange: ["orange", "оранжевый", "to‘q sariq"],
    peach: ["peach", "персиковый", "shaftoli rang"],
    yellow: ["yellow", "жёлтый", "sariq"],
    green: ["green", "зелёный", "yashil"],
    blue: ["blue", "синий", "ko‘k"],
    light_blue: ["light blue", "голубой", "havorang"],
    purple: ["purple", "фиолетовый", "binafsha"],
  },
  pattern: {
    plaid: ["plaid", "клетка", "katak"],
    striped: ["striped", "полоска", "yo‘l-yo‘l"],
    floral: ["floral print", "цветочный принт", "gulli print"],
    polka_dot: ["polka dots", "горох", "no‘xat naqsh"],
    animal: ["animal print", "анималистичный принт", "hayvon printi"],
    printed: ["print", "принт", "print"],
  },
  sleeve: {
    sleeveless: ["sleeveless", "без рукавов", "yengsiz"],
    short: ["short sleeves", "короткие рукава", "kalta yeng"],
    three_quarter: ["three-quarter sleeves", "рукава 3/4", "3/4 yeng"],
    long: ["long sleeves", "длинные рукава", "uzun yeng"],
  },
  neckline: {
    collared: ["collar", "воротник", "yoqa"],
    v_neck: ["V-neck", "V-образный вырез", "V shaklidagi yoqa"],
    round: ["round neckline", "круглый вырез", "yumaloq yoqa"],
  },
  closure: {
    buttons: ["button closure", "застёжка на пуговицы", "tugmali"],
    zipper: ["zip closure", "застёжка-молния", "zamokli"],
  },
  detail: {
    waist_belt: ["waist belt", "пояс", "belbog‘"],
    lace: ["lace trim", "кружевная отделка", "to‘r bezak"],
    ruffle: ["ruffle detail", "оборка", "burma bezak"],
    pockets: ["pockets", "карманы", "cho‘ntaklar"],
    hood: ["hood", "капюшон", "kapyushon"],
    embroidery: ["embroidery", "вышивка", "kashta"],
  },
  component: {
    camisole: ["camisole", "топ на бретелях", "yelkali mayka"],
    tank_top: ["tank top", "майка", "mayka"],
    tshirt: ["T-shirt", "футболка", "futbolka"],
    shirt: ["shirt", "рубашка", "ko‘ylak"],
    shorts: ["shorts", "шорты", "shortik"],
    capri: ["capri trousers", "бриджи", "kapri ishton"],
    trousers: ["trousers", "штаны", "ishton"],
    robe: ["robe", "халат", "xalat"],
    hoodie: ["hoodie", "худи", "hudi"],
  },
};

const MATERIAL_LABELS = {
  bamboo: ["Bamboo fabric", "Бамбуковая ткань", "Bambuk mato"],
  cotton: ["Cotton fabric", "Хлопковая ткань", "Paxta mato"],
  viscose: ["Viscose fabric", "Вискозная ткань", "Viskoza mato"],
  silk: ["Silk fabric", "Шёлковая ткань", "Ipak mato"],
  satin: ["Satin fabric", "Атласная ткань", "Atlas mato"],
  muslin: ["Muslin", "Муслин", "Muslin"],
  modal: ["Modal fabric", "Ткань модал", "Modal mato"],
  velour: ["Velour", "Велюр", "Velur"],
  fleece: ["Fleece knit", "Трикотаж с начёсом", "Tukli trikotaj"],
  suprem: ["Suprem knit", "Трикотаж супрем", "Suprem trikotaj"],
  rib_knit: ["Rib knit", "Трикотаж лапша", "Lapsha trikotaj"],
  staple: ["Staple fabric", "Штапель", "Shtapel"],
  two_thread: ["Two-thread knit", "Двухниточный трикотаж", "Ikki ipli trikotaj"],
  three_thread: ["Three-thread knit", "Трёхниточный трикотаж", "Uch ipli trikotaj"],
  knit: ["Knit fabric", "Трикотаж", "Trikotaj"],
  polyester: ["Polyester fabric", "Полиэстеровая ткань", "Poliester mato"],
};

function sourceText(product) {
  const fabric = product?.fabric || {};
  return [
    product?.name, product?.variant, product?.model_no,
    fabric.en, fabric.ru, fabric.uz,
  ].filter(Boolean).join(" ").toLowerCase().replace(/ё/g, "е");
}

function firstMatch(text, entries) {
  return entries.find(([, pattern]) => pattern.test(text))?.[0] || "";
}

function visibleFacts(product, productType) {
  const text = sourceText(product);
  const resolvedType = productType || product?.product_type || "set";
  const facts = {
    product_type: resolvedType,
    color: firstMatch(text, [
      ["raspberry", /малинов|raspberry|malina/],
      ["light_blue", /голуб|light[\s-]?blue|havorang/],
      ["black", /(?:^|\W)(?:черн|чёрн|black|qora)(?:\W|$)/],
      ["white", /(?:^|\W)(?:бел|white|oq)(?:\W|$)/],
      ["gray", /(?:^|\W)(?:сер|gray|grey|kulrang)(?:\W|$)/],
      ["beige", /(?:^|\W)(?:беж|beige|bej)(?:\W|$)/],
      ["brown", /(?:^|\W)(?:корич|brown|jigarrang)(?:\W|$)/],
      ["burgundy", /(?:^|\W)(?:бордов|burgundy|bordo)(?:\W|$)/],
      ["red", /(?:^|\W)(?:красн|red|qizil)(?:\W|$)/],
      ["pink", /(?:^|\W)(?:розов|pink|pushti)(?:\W|$)/],
      ["orange", /(?:^|\W)(?:оранж|orange)(?:\W|$)/],
      ["peach", /(?:^|\W)(?:персик|peach|shaftoli)(?:\W|$)/],
      ["yellow", /(?:^|\W)(?:желт|жёлт|yellow|sariq)(?:\W|$)/],
      ["green", /(?:^|\W)(?:зелен|зелён|green|yashil)(?:\W|$)/],
      ["blue", /(?:^|\W)(?:син|blue|ko['‘’]?k)(?:\W|$)/],
      ["purple", /(?:^|\W)(?:фиолет|purple|binafsha)(?:\W|$)/],
    ]),
    pattern: firstMatch(text, [
      ["plaid", /клетк|plaid|checkered|katak/],
      ["striped", /полоск|striped|yo['‘’]?l/],
      ["polka_dot", /горох|polka/],
      ["floral", /цветоч|floral|gulli/],
      ["animal", /леопард|тигр|animal/],
      ["printed", /принт|print/],
    ]),
    sleeve: firstMatch(text, [
      ["sleeveless", /без\s*рукав|sleeveless|yengsiz/],
      ["three_quarter", /(?:3\s*\/\s*4|3\/4)/],
      ["short", /(?:к\s*\/\s*р|коротк.{0,10}рукав|short.{0,10}sleeve|kalta.{0,10}yeng)/],
      ["long", /(?:д\s*\/\s*р|длинн.{0,10}рукав|long.{0,10}sleeve|uzun.{0,10}yeng)/],
    ]),
    neckline: firstMatch(text, [
      ["v_neck", /v[\s-]?(?:образ|neck)|v\s*вырез/],
      ["round", /кругл.{0,10}(?:вырез|горлов)|round.{0,10}neck/],
      ["collared", /воротник|collar|yoqa/],
    ]),
    closure: firstMatch(text, [
      ["buttons", /пугов|button|tugma/],
      ["zipper", /молни|замок|zipper|zip\b|zamok/],
    ]),
    details: [],
    components: [],
    pieces: /тройк|three[\s-]?piece|3[\s-]?piece/.test(text)
      ? 3
      : /двойк|two[\s-]?piece|2[\s-]?piece/.test(text)
        ? 2
        : ["set", "pajamas", "tracksuit"].includes(resolvedType) ? 2 : 0,
  };
  [
    ["waist_belt", /пояс|ремен|belt|belbog/],
    ["lace", /кружев|гипюр|lace|to['‘’]?r/],
    ["ruffle", /оборк|волан|ruffle|burma/],
    ["pockets", /карман|pocket|cho['‘’]?ntak/],
    ["hood", /капюш|hood|kapyush/],
    ["embroidery", /вышив|embroid|kashta/],
  ].forEach(([key, pattern]) => {
    if (pattern.test(text)) facts.details.push(key);
  });
  if (["set", "pajamas", "tracksuit"].includes(resolvedType)) {
    [
      ["camisole", /лямк|camisole|spaghetti[\s-]?strap/],
      ["tank_top", /(?:^|\W)(?:майк|tank[\s-]?top)(?:\W|$)/],
      ["tshirt", /футболк|t[\s-]?shirt|futbolka|(?:^|\W)фут(?:\W|$)/],
      ["shirt", /рубашк|(?:^|\W)shirt(?:\W|$)/],
      ["shorts", /шорт|shorts?|shortik/],
      ["capri", /бридж|capri|kapri/],
      ["trousers", /штан|trousers?|pants|ishton/],
      ["robe", /халат|robe|xalat/],
      ["hoodie", /худи|hoodie|hudi|капюш/],
    ].forEach(([key, pattern]) => {
      if (pattern.test(text)) facts.components.push(key);
    });
  }
  const reviewed = PHOTO_FACTS[String(product?.id || "")] || {};
  return {
    ...facts,
    ...reviewed,
    details: Array.isArray(reviewed.details) ? reviewed.details : facts.details,
    components: Array.isArray(reviewed.components) ? reviewed.components : facts.components,
  };
}

function localizedFact(kind, key, lang) {
  const index = lang === "ru" ? 1 : lang === "uz" ? 2 : 0;
  return FACT_LABELS[kind]?.[key]?.[index] || "";
}

function descriptionFromFacts(facts, lang = "en") {
  const language = ["en", "ru", "uz"].includes(lang) ? lang : "en";
  const type = TYPE_LABELS[language][facts.product_type] || TYPE_LABELS[language].set;
  const details = [];
  if (facts.pieces > 1) {
    details.push(language === "ru"
      ? `${facts.pieces} предмета`
      : language === "uz" ? `${facts.pieces} qism` : `${facts.pieces} pieces`);
  }
  const color = localizedFact("color", facts.color, language);
  if (color) {
    details.push(language === "ru"
      ? `цвет — ${color}`
      : language === "uz" ? `rang — ${color}` : `color — ${color}`);
  }
  ["pattern", "sleeve", "neckline", "closure"].forEach((kind) => {
    const value = localizedFact(kind, facts[kind], language);
    if (value) details.push(value);
  });
  (facts.details || []).forEach((key) => {
    const value = localizedFact("detail", key, language);
    if (value) details.push(value);
  });
  const components = (facts.components || [])
    .map((key) => localizedFact("component", key, language))
    .filter(Boolean);
  if (components.length) {
    details.push(language === "ru"
      ? `в комплекте: ${components.join(", ")}`
      : language === "uz"
        ? `to‘plamda: ${components.join(", ")}`
        : `includes: ${components.join(", ")}`);
  }
  const detailText = details.join("; ");
  if (language === "ru") {
    return `Тип изделия на фото: ${type}.${detailText ? ` Видимые детали: ${detailText}.` : ""}`;
  }
  if (language === "uz") {
    return `Suratdagi mahsulot turi: ${type}.${detailText ? ` Ko‘rinadigan detallar: ${detailText}.` : ""}`;
  }
  return `Product type shown in the photo: ${type}.${detailText ? ` Visible details: ${detailText}.` : ""}`;
}

function materialKey(product) {
  return firstMatch(sourceText(product), [
    ["three_thread", /трехнит|трёхнит|three[\s-]?thread|uch\s*ip/],
    ["two_thread", /двухнит|two[\s-]?thread|ikki\s*ip/],
    ["bamboo", /бамбук|bamboo|bambuk/],
    ["viscose", /вискоз|viscose|viskoza/],
    ["silk", /шелк|шёлк|silk|ipak/],
    ["satin", /атлас|satin|atlas/],
    ["muslin", /муслин|muslin/],
    ["modal", /модал|modal/],
    ["velour", /велюр|velour|velur/],
    ["fleece", /футер|fleece|начес|начёс/],
    ["suprem", /супрем|suprem/],
    ["rib_knit", /лапша|lapsha|rib[\s-]?knit/],
    ["staple", /штапел|staple|shtapel/],
    ["cotton", /хлопок|cotton|paxta/],
    ["polyester", /полиэстер|polyester|poliester/],
    ["knit", /трикотаж|knit|trikotaj/],
  ]);
}

function localizedMaterial(product, lang = "en") {
  const index = lang === "ru" ? 1 : lang === "uz" ? 2 : 0;
  const key = materialKey(product);
  if (key) return MATERIAL_LABELS[key][index];
  /* материал не распознан — показываем собственное описание модели из каталога,
     оно информативнее заглушки; заглушка остаётся только когда описания нет вовсе */
  const own = product?.fabric || {};
  const fallback = [own[lang], own.ru, own.en, own.uz]
    .map((v) => String(v || "").trim())
    .find((v) => v && !/не указан|not specified|ko‘rsatilmagan|korsatilmagan/i.test(v));
  if (fallback) return fallback;
  return lang === "ru"
    ? "Состав не указан — уточните у менеджера"
    : lang === "uz"
      ? "Tarkibi ko‘rsatilmagan — menejerdan aniqlang"
      : "Composition not specified — confirm with a manager";
}

function localizedCare(product, lang = "en") {
  const material = materialKey(product);
  const profile = ["silk", "satin"].includes(material)
    ? "delicate"
    : material === "velour"
      ? "pile"
      : ["fleece", "two_thread", "three_thread"].includes(material)
        ? "warm_knit"
        : material ? "standard" : "unknown";
  const copy = {
    en: {
      unknown: "Composition is unconfirmed. Follow the garment label; if it is unavailable, ask a manager before washing or ironing.",
      standard: "Follow the garment label. If permitted: wash gently at 30 °C, air dry and iron on low heat.",
      delicate: "Follow the garment label. If permitted: hand wash or use a cold delicate cycle, do not wring, air dry away from direct sun and iron from the reverse on the lowest heat.",
      pile: "Follow the garment label. If permitted: wash inside out at 30 °C on a delicate cycle, do not bleach or tumble dry, air dry and do not iron the pile.",
      warm_knit: "Follow the garment label. If permitted: wash inside out at 30 °C, do not bleach or tumble dry, reshape while damp, air dry and iron from the reverse on low heat.",
    },
    ru: {
      unknown: "Состав не подтверждён. Следуйте ярлыку изделия; если ярлык недоступен, уточните уход у менеджера до стирки или глажки.",
      standard: "Следуйте ярлыку изделия. Если разрешено: деликатная стирка при 30 °C, сушка без машины и глажка при низкой температуре.",
      delicate: "Следуйте ярлыку изделия. Если разрешено: ручная стирка или холодный деликатный режим, не выкручивать, сушить вдали от прямого солнца и гладить с изнанки при минимальной температуре.",
      pile: "Следуйте ярлыку изделия. Если разрешено: деликатная стирка при 30 °C с изнанки, без отбеливателя и машинной сушки; сушить естественно, ворс не гладить.",
      warm_knit: "Следуйте ярлыку изделия. Если разрешено: стирка при 30 °C с изнанки, без отбеливателя и машинной сушки; расправить во влажном виде, сушить естественно и гладить с изнанки при низкой температуре.",
    },
    uz: {
      unknown: "Tarkibi tasdiqlanmagan. Mahsulot yorlig‘iga amal qiling; yorliq bo‘lmasa, yuvish yoki dazmollashdan oldin menejerdan aniqlang.",
      standard: "Mahsulot yorlig‘iga amal qiling. Ruxsat etilsa: 30 °C da nozik yuvish, tabiiy quritish va past haroratda dazmollash.",
      delicate: "Mahsulot yorlig‘iga amal qiling. Ruxsat etilsa: qo‘lda yoki sovuq nozik rejimda yuvish, siqib buramaslik, to‘g‘ridan-to‘g‘ri quyoshdan uzoqda quritish va teskari tomonidan eng past haroratda dazmollash.",
      pile: "Mahsulot yorlig‘iga amal qiling. Ruxsat etilsa: teskari qilib 30 °C da nozik rejimda yuvish, oqartirgich va quritgich ishlatmaslik, tabiiy quritish hamda tukli yuzani dazmollamaslik.",
      warm_knit: "Mahsulot yorlig‘iga amal qiling. Ruxsat etilsa: teskari qilib 30 °C da yuvish, oqartirgich va quritgich ishlatmaslik, namligida shaklini to‘g‘rilash, tabiiy quritish va teskari tomonidan past haroratda dazmollash.",
    },
  };
  const language = ["en", "ru", "uz"].includes(lang) ? lang : "en";
  return copy[language][profile];
}

module.exports = {
  TYPE_LABELS,
  visibleFacts,
  descriptionFromFacts,
  materialKey,
  localizedMaterial,
  localizedCare,
};
