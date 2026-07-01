import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const firestoreScope = 'https://www.googleapis.com/auth/datastore';

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function readServiceAccount(file) {
  if (file) return JSON.parse(await fs.readFile(file, 'utf8'));
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return JSON.parse(await fs.readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  }
  return null;
}

async function tokenFromServiceAccount(serviceAccount, scope = firestoreScope) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = serviceAccount.token_uri || 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  if (!claim.iss || !serviceAccount.private_key) {
    throw new Error('Service account JSON must contain client_email and private_key.');
  }

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), serviceAccount.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json().catch(async () => ({ error_description: await response.text() }));
  if (!response.ok) {
    throw new Error(`Google OAuth token request failed ${response.status}: ${body.error_description || body.error || 'unknown_error'}`);
  }
  return body.access_token;
}

export async function googleAccessToken(args, scope = firestoreScope) {
  if (args.get('--access-token')) return args.get('--access-token');
  if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN;

  const serviceAccount = await readServiceAccount(args.get('--service-account'));
  if (serviceAccount) return tokenFromServiceAccount(serviceAccount, scope);

  try {
    return execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'Google API access needs credentials. Pass --access-token, pass --service-account /path/key.json, set FIRESTORE_ACCESS_TOKEN, set FIREBASE_SERVICE_ACCOUNT_JSON, set GOOGLE_APPLICATION_CREDENTIALS, or install gcloud and run gcloud auth application-default login.',
    );
  }
}
