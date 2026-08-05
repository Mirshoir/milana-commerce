"use strict";

function checkoutError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function boolValue(value, defaultValue = false) {
  if (value === null || value === undefined || value === "") return defaultValue;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return Boolean(value);
}

function stockValue(value, precision = 0) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** precision;
  return Math.max(0, Math.round(parsed * factor) / factor);
}

function basePrice(product, mode) {
  if (mode === "retail") {
    return Number(product.retail_price || product.price || 0) || 0;
  }
  return Number(product.wholesale_price || product.price || 0) || 0;
}

function discountedPrice(product, mode, discount) {
  const base = basePrice(product, mode);
  const safeDiscount = Math.max(0, Math.min(90, Number(discount) || 0));
  return {
    base,
    discount: safeDiscount,
    unit: Math.round(base * (1 - safeDiscount / 100) * 100) / 100,
    source: safeDiscount ? "customer_discount" : "public_catalog",
  };
}

function normalizeSizes(product) {
  return arrayValue(product.sizes)
    .map((size) => String(size == null ? "" : size).trim())
    .filter(Boolean);
}

/*
 * Stock is deliberately excluded. Inventory may legitimately change between
 * the storefront read and row lock; it is checked against the requested
 * quantity after the row is locked. Product flags, sizes and price inputs are
 * immutable checkout expectations: changing any of them requires the shopper
 * to review the updated product rather than accepting a silent substitution.
 */
function checkoutProductSnapshot(product, options = {}) {
  const orderType = options.orderType === "retail" ? "retail" : "wholesale";
  const unitType = String(options.unitType || "").toLowerCase();
  const snapshot = {
    active: boolValue(product.active, true),
    preorder: boolValue(product.preorder, false),
    retail_enabled: boolValue(product.retail_enabled, true),
    gender: String(product.gender || ""),
    category: String(product.category || ""),
    sizes: normalizeSizes(product),
  };
  if (orderType === "retail") {
    snapshot.retail_base = basePrice(product, "retail");
  } else if (unitType === "pachka") {
    snapshot.wholesale_base = basePrice(product, "wholesale");
    snapshot.retail_base = basePrice(product, "retail");
    snapshot.pack_markup = Math.max(0, Math.min(200, Number(options.packMarkup) || 0));
  } else {
    snapshot.wholesale_base = basePrice(product, "wholesale");
  }
  return snapshot;
}

function sameSnapshot(expected, current) {
  return JSON.stringify(expected || null) === JSON.stringify(current);
}

function authoritativeCheckoutLine(options) {
  const product = options.product || {};
  const draft = options.draftItem || {};
  const orderType = options.orderType === "retail" ? "retail" : "wholesale";
  const unitType = orderType === "retail" ? "piece" : String(draft.unit_type || "qop").toLowerCase();
  const packMarkup = Math.max(0, Math.min(200, Number(options.packMarkup) || 0));
  const currentSnapshot = checkoutProductSnapshot(product, { orderType, unitType, packMarkup });
  if (!sameSnapshot(draft.checkout_guard, currentSnapshot)) {
    throw checkoutError("checkout_product_changed");
  }
  if (!currentSnapshot.active) throw checkoutError("checkout_product_changed");
  if (currentSnapshot.preorder) throw checkoutError("checkout_product_changed");
  if (orderType === "retail" && !currentSnapshot.retail_enabled) {
    throw checkoutError("checkout_product_changed");
  }

  const qty = Number(draft.qty);
  if (!Number.isInteger(qty) || qty < 1) throw checkoutError("invalid_qty");
  const sizes = currentSnapshot.sizes;
  let requestedSize = String(draft.size || "").trim();
  if (orderType === "retail") {
    if (!requestedSize) throw checkoutError("checkout_product_changed");
    const matchedSize = sizes.find(
      (size) => size.toLocaleLowerCase() === requestedSize.toLocaleLowerCase(),
    );
    if (sizes.length && !matchedSize) throw checkoutError("checkout_product_changed");
    if (matchedSize) requestedSize = matchedSize;
  }

  const discount = Math.max(0, Math.min(90, Number(options.discount) || 0));
  let pricing;
  if (orderType === "retail") {
    pricing = discountedPrice(product, "retail", discount);
  } else if (unitType === "pachka") {
    const wholesale = discountedPrice(product, "wholesale", discount);
    const retail = discountedPrice(product, "retail", discount);
    pricing = retail.unit > wholesale.unit
      ? { ...retail, source: "retail_price" }
      : {
          ...wholesale,
          unit: Math.round(wholesale.unit * (1 + packMarkup / 100) * 100) / 100,
          source: packMarkup ? "pack_markup" : wholesale.source,
        };
  } else {
    pricing = discountedPrice(product, "wholesale", discount);
  }

  const bagSize = orderType === "retail" ? 1 : Number(draft.bag_size);
  if (!Number.isFinite(bagSize) || bagSize <= 0) throw checkoutError("checkout_product_changed");
  const unitPrice = pricing.unit;
  const price = Math.round(unitPrice * bagSize * 100) / 100;
  let stockAdjustment = null;
  if (orderType === "retail") {
    const remaining = stockValue(product.retail_stock, 0);
    if (remaining !== null) {
      if (remaining < qty) throw checkoutError("insufficient_stock");
      stockAdjustment = { type: "retail", id: Number(product.id), qty };
    }
  } else {
    const orderBagSize = Math.max(1, Number(options.orderBagSize) || 1);
    const qop = Math.round((qty * bagSize / orderBagSize) * 1000) / 1000;
    const remaining = stockValue(product.available_qop, 3);
    if (remaining !== null) {
      if (remaining < qop) throw checkoutError("insufficient_stock");
      stockAdjustment = { type: "wholesale", id: Number(product.id), qop };
    }
  }

  const line = {
    ...draft,
    id: Number(product.id),
    qty,
    unit_price: unitPrice,
    bag_size: bagSize,
    unit_type: unitType,
    size: requestedSize,
    price,
    stock_adjustment: stockAdjustment,
    price_pending: false,
    price_source: pricing.source,
  };
  delete line.checkout_guard;
  return { line, stockAdjustment, lineTotal: Math.round(price * qty * 100) / 100 };
}

function customerCheckoutPricing(customer) {
  const tier = ["regular", "premium", "vip"].includes(customer?.customer_tier)
    ? customer.customer_tier
    : "regular";
  const active = customer?.approval_status === "active";
  const discount = customer && active && ["premium", "vip"].includes(tier)
    ? Math.max(0, Math.min(90, Number(customer.price_discount) || 0))
    : 0;
  return { active, tier, discount };
}

function checkoutDriversShareTransaction(catalogDriver, commerceDriver) {
  return String(catalogDriver || "sqlite").toLowerCase()
    === String(commerceDriver || "sqlite").toLowerCase();
}

module.exports = {
  authoritativeCheckoutLine,
  checkoutDriversShareTransaction,
  checkoutProductSnapshot,
  customerCheckoutPricing,
  stockValue,
};
