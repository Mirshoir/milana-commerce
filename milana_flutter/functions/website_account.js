'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { requestPublicApi } = require('./public_api');

const websiteSessionTokenFields = new Set([
  'website_session_token',
  '_website_session_token',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function requestData(request) {
  const data = request?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function suppliedWebsiteSessionToken(request) {
  const data = requestData(request);
  return String(
    data.website_session_token || data._website_session_token || '',
  ).trim();
}

function verifiedFirebaseIdentity(request) {
  const uid = String(request?.auth?.uid || '').trim();
  const claims = request?.auth?.token || {};
  const email = normalizeEmail(claims.email);
  const emailVerified =
    claims.email_verified === true || claims.email_verified === 'true';
  if (!uid || !email || !emailVerified) {
    throw new HttpsError(
      'unauthenticated',
      'A verified Firebase email is required for website account access.',
    );
  }
  return { uid, email };
}

function stripWebsiteSessionTokens(value) {
  if (Array.isArray(value)) return value.map(stripWebsiteSessionTokens);
  if (!value || typeof value !== 'object') return value;
  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (websiteSessionTokenFields.has(key)) continue;
    sanitized[key] = stripWebsiteSessionTokens(entry);
  }
  return sanitized;
}

function websitePublicApiError(result, fallback) {
  const message =
    result?.body && typeof result.body.error === 'string'
      ? result.body.error
      : fallback;
  if (result?.status === 429) {
    return new HttpsError('resource-exhausted', message);
  }
  if (result?.status === 401 || result?.status === 403) {
    return new HttpsError('unauthenticated', 'Website session has expired.');
  }
  if (result?.status >= 400 && result?.status < 500) {
    return new HttpsError('invalid-argument', message);
  }
  return new HttpsError('unavailable', fallback);
}

async function validatedWebsiteSession(
  request,
  { optional = false, requestApi = requestPublicApi } = {},
) {
  const token = suppliedWebsiteSessionToken(request);
  if (!token && optional) return '';
  const identity = verifiedFirebaseIdentity(request);
  if (!/^[a-fA-F0-9]{64}$/.test(token)) {
    throw new HttpsError('unauthenticated', 'Website session is invalid.');
  }

  let result;
  try {
    result = await requestApi({
      path: '/api/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (_) {
    throw new HttpsError(
      'unavailable',
      'Website account validation is temporarily unavailable.',
    );
  }

  if (result?.status === 401 || result?.status === 403) {
    throw new HttpsError('unauthenticated', 'Website session has expired.');
  }
  if (!result?.ok || !result.body || typeof result.body !== 'object') {
    throw new HttpsError(
      'unavailable',
      'Website account validation is temporarily unavailable.',
    );
  }

  const customer =
    result.body.customer && typeof result.body.customer === 'object'
      ? result.body.customer
      : null;
  const websiteCustomerId = String(customer?.id || '').trim();
  const websiteEmail = normalizeEmail(customer?.email);
  if (!websiteCustomerId || !websiteEmail) {
    throw new HttpsError('unauthenticated', 'Website session is invalid.');
  }
  if (websiteEmail !== identity.email) {
    throw new HttpsError(
      'permission-denied',
      'Website session does not belong to the signed-in Firebase account.',
    );
  }
  return token;
}

async function forwardWebsiteRequest({
  request,
  path,
  method = 'GET',
  data,
  fallback,
  optionalSession = false,
  requestApi = requestPublicApi,
}) {
  const token = await validatedWebsiteSession(request, {
    optional: optionalSession,
    requestApi,
  });
  let result;
  try {
    result = await requestApi({
      path,
      method,
      data: data === undefined ? undefined : stripWebsiteSessionTokens(data),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (_) {
    throw new HttpsError('unavailable', fallback);
  }
  if (!result?.ok || !result.body || typeof result.body !== 'object') {
    throw websitePublicApiError(result, fallback);
  }
  return result.body;
}

module.exports = {
  forwardWebsiteRequest,
  normalizeEmail,
  stripWebsiteSessionTokens,
  suppliedWebsiteSessionToken,
  validatedWebsiteSession,
  verifiedFirebaseIdentity,
  websitePublicApiError,
  websiteSessionTokenFields,
};
