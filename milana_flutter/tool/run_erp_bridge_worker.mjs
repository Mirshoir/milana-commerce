#!/usr/bin/env node
import crypto from 'node:crypto';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, 'true');
  }
}

const projectId = args.get('--project') || process.env.FIREBASE_PROJECT_ID;
const apiKey = args.get('--api-key') || process.env.FIREBASE_API_KEY;
const region = args.get('--region') || process.env.FIREBASE_FUNCTIONS_REGION || 'asia-southeast1';
const email = args.get('--email') || process.env.ERP_BRIDGE_EMAIL;
const password = args.get('--password') || process.env.ERP_BRIDGE_PASSWORD;
const webhookUrl = args.get('--webhook-url') || process.env.ERP_WEBHOOK_URL;
const webhookSecret = args.get('--webhook-secret') || process.env.ERP_WEBHOOK_SECRET || '';
const worker = args.get('--worker') || process.env.ERP_BRIDGE_WORKER || 'milana-erp-bridge';
const limit = Number(args.get('--limit') || process.env.ERP_BRIDGE_LIMIT || 20);
const leaseSeconds = Number(args.get('--lease-seconds') || process.env.ERP_BRIDGE_LEASE_SECONDS || 300);
const dryRun = args.has('--dry-run') || process.env.ERP_BRIDGE_DRY_RUN === '1';
const functionsBaseUrl =
  args.get('--functions-base-url') ||
  process.env.FIREBASE_FUNCTIONS_BASE_URL ||
  (projectId ? `https://${region}-${projectId}.cloudfunctions.net` : '');

if (!projectId) throw new Error('Pass --project or set FIREBASE_PROJECT_ID.');
if (!apiKey) throw new Error('Pass --api-key or set FIREBASE_API_KEY.');
if (!email) throw new Error('Pass --email or set ERP_BRIDGE_EMAIL.');
if (!password) throw new Error('Pass --password or set ERP_BRIDGE_PASSWORD.');
if (!webhookUrl && !dryRun) throw new Error('Pass --webhook-url or set ERP_WEBHOOK_URL.');
if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error('ERP bridge limit must be an integer from 1 to 100.');
}
if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 3600) {
  throw new Error('ERP bridge lease seconds must be an integer from 30 to 3600.');
}

async function signIn() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`ERP bridge Firebase sign-in failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.idToken;
}

async function callFunction(idToken, name, data) {
  const response = await fetch(`${functionsBaseUrl.replace(/\/+$/, '')}/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${idToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(async () => ({
    error: { message: await response.text() },
  }));
  if (!response.ok || body.error) {
    throw new Error(`${name} failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

function signature(payload) {
  if (!webhookSecret) return '';
  return crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');
}

async function deliverEvent(event) {
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, event }, null, 2));
    return { externalId: `dry-${event.id}` };
  }

  const payload = JSON.stringify({
    id: event.id,
    type: event.type,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    actor: event.actor,
    payload: event.payload,
    attempts: event.attempts,
    created_at: event.created_at,
  });
  const headers = {
    'content-type': 'application/json',
    'x-milana-event-id': event.id,
    'x-milana-event-type': event.type,
  };
  const digest = signature(payload);
  if (digest) headers['x-milana-signature'] = `sha256=${digest}`;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: payload,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ERP webhook failed ${response.status}: ${text.slice(0, 1000)}`);
  }
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  return {
    externalId: String(parsed.external_id || parsed.id || ''),
  };
}

const idToken = await signIn();
const claim = await callFunction(idToken, 'claimErpEvents', {
  limit,
  lease_seconds: leaseSeconds,
  worker,
});

const summary = {
  claimed: claim.events.length,
  processed: 0,
  failed: 0,
  event_ids: claim.events.map((event) => event.id),
};

for (const event of claim.events) {
  try {
    const delivery = await deliverEvent(event);
    await callFunction(idToken, 'ackErpEvent', {
      event_id: event.id,
      status: 'processed',
      worker,
      external_id: delivery.externalId,
    });
    summary.processed += 1;
  } catch (error) {
    await callFunction(idToken, 'ackErpEvent', {
      event_id: event.id,
      status: 'failed',
      worker,
      error: error.message,
    });
    summary.failed += 1;
  }
}

console.log(JSON.stringify(summary, null, 2));
