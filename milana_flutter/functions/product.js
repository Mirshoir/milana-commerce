'use strict';

function text(value, max, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : fallback;
  if (normalized.length > max) {
    throw new Error('invalid-text');
  }
  return normalized;
}

function normalizeProductUpdate(data = {}) {
  const slug = text(data.slug, 200);
  const productId = text(data.product_id, 80);
  if (!slug && !productId) {
    throw new Error('missing-product');
  }

  const update = {};
  if (Object.prototype.hasOwnProperty.call(data, 'active')) {
    if (typeof data.active !== 'boolean') throw new Error('invalid-active');
    update.active = data.active;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'price')) {
    const price = Number(data.price);
    if (!Number.isFinite(price) || price < 0 || price > 9999) {
      throw new Error('invalid-price');
    }
    update.price = Number(price.toFixed(2));
  }
  if (Object.prototype.hasOwnProperty.call(data, 'available_qop')) {
    const availableQop = Number(data.available_qop);
    if (!Number.isInteger(availableQop) || availableQop < 0 || availableQop > 99999) {
      throw new Error('invalid-available-qop');
    }
    update.available_qop = availableQop;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sizes')) {
    if (!Array.isArray(data.sizes) || data.sizes.length === 0 || data.sizes.length > 20) {
      throw new Error('invalid-sizes');
    }
    const seen = new Set();
    update.sizes = data.sizes
      .map((size) => text(size, 12))
      .filter((size) => size && !seen.has(size) && seen.add(size));
    if (update.sizes.length === 0) throw new Error('invalid-sizes');
  }

  if (Object.keys(update).length === 0) {
    throw new Error('empty-update');
  }

  return { slug, productId, update };
}

module.exports = {
  normalizeProductUpdate,
};
