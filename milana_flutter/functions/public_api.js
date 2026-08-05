'use strict';

const defaultPublicApiBaseUrl = 'https://milanapremium.uz';
const defaultPublicApiTimeoutMs = 15_000;
const defaultPublicApiMaxResponseBytes = 2 * 1024 * 1024;

class PublicApiRequestError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'PublicApiRequestError';
    this.code = code;
  }
}

function publicApiBaseUrl(value = process.env.MILANA_PUBLIC_API_BASE_URL) {
  const normalized = String(value || defaultPublicApiBaseUrl).replace(/\/+$/, '');
  const url = new URL(normalized);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('invalid-public-api-url');
  }
  return normalized;
}

async function requestPublicApi({
  path,
  method = 'GET',
  data,
  headers,
  fetchImpl = fetch,
  baseUrl,
  timeoutMs = defaultPublicApiTimeoutMs,
  maxResponseBytes = defaultPublicApiMaxResponseBytes,
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('invalid-public-api-timeout');
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new TypeError('invalid-public-api-response-limit');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${publicApiBaseUrl(baseUrl)}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(headers || {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal: controller.signal,
    });
    const body = await limitedJsonResponse(response, maxResponseBytes);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    if (error instanceof PublicApiRequestError) throw error;
    if (controller.signal.aborted) {
      throw new PublicApiRequestError('public_api_timeout', { cause: error });
    }
    throw new PublicApiRequestError('public_api_network_error', { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function limitedJsonResponse(response, maxResponseBytes) {
  const declaredLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new PublicApiRequestError('public_api_response_too_large');
  }

  let source;
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        await reader.cancel().catch(() => {});
        throw new PublicApiRequestError('public_api_response_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    source = text + decoder.decode();
  } else if (typeof response?.text === 'function') {
    source = await response.text();
    if (Buffer.byteLength(source, 'utf8') > maxResponseBytes) {
      throw new PublicApiRequestError('public_api_response_too_large');
    }
  } else if (typeof response?.json === 'function') {
    const decoded = await response.json();
    source = JSON.stringify(decoded);
    if (Buffer.byteLength(source, 'utf8') > maxResponseBytes) {
      throw new PublicApiRequestError('public_api_response_too_large');
    }
  } else {
    source = '';
  }

  try {
    return JSON.parse(source);
  } catch (_) {
    return {};
  }
}

module.exports = {
  defaultPublicApiMaxResponseBytes,
  defaultPublicApiBaseUrl,
  defaultPublicApiTimeoutMs,
  limitedJsonResponse,
  PublicApiRequestError,
  publicApiBaseUrl,
  requestPublicApi,
};
