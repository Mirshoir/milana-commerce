#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const supportedListingLocales = new Set(['en-US', 'en-GB', 'ru-RU']);
const requiredUrlKeys = ['marketing', 'support', 'privacy', 'accountDeletion', 'terms'];
const requiredQuestionnaireIds = {
  global: ['legal-pages', 'public-account-deletion'],
  android: [
    'data-safety', 'account-deletion', 'app-access', 'ads', 'content-rating',
    'target-audience', 'financial-features', 'health-apps', 'ai-generated-content-policy',
  ],
  ios: ['app-privacy', 'age-rating', 'content-rights', 'export-compliance', 'eu-dsa-trader-status'],
};
const requiredDecisionIds = {
  android: [
    'pricing', 'countries', 'managed-publishing', 'device-form-factors',
    'developer-account-type', 'production-access',
  ],
  ios: ['pricing', 'territories', 'release-method', 'device-availability'],
};
const platformSection = { android: 'googlePlay', ios: 'appStore' };

export class StoreListingError extends Error {
  constructor(blockers, checks = []) {
    super(`Store listing verification failed with ${blockers.length} blocker(s).`);
    this.name = 'StoreListingError';
    this.blockers = blockers;
    this.checks = checks;
  }
}

function characterLength(value) {
  return Array.from(String(value || '')).length;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const separator = argument.indexOf('=');
    if (separator !== -1) {
      values.set(argument.slice(0, separator), argument.slice(separator + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values.set(argument, next);
      index += 1;
    } else {
      values.set(argument, 'true');
    }
  }
  const mode = values.get('--mode') || 'prepared';
  const platform = values.get('--platform') || 'all';
  if (!['prepared', 'submission'].includes(mode)) {
    throw new Error('--mode must be prepared or submission.');
  }
  if (!['android', 'ios', 'all'].includes(platform)) {
    throw new Error('--platform must be android, ios, or all.');
  }
  return {
    mode,
    platform,
    version: values.get('--version') || null,
    buildNumber: values.get('--build-number') || null,
    definesPath: values.get('--defines') || null,
  };
}

function selectedPlatforms(platform) {
  return platform === 'all' ? ['android', 'ios'] : [platform];
}

function isPrivateIp(hostname) {
  const version = net.isIP(hostname);
  if (version === 4) {
    const octets = hostname.split('.').map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
  }
  if (version === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') || normalized.startsWith('fea') ||
      normalized.startsWith('feb');
  }
  return false;
}

function isPublicHttps(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      hostname && hostname !== 'localhost' && !hostname.endsWith('.localhost') &&
      !hostname.endsWith('.local') && !hostname.endsWith('.test') && !isPrivateIp(hostname);
  } catch {
    return false;
  }
}

function normalizedUrl(value) {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function pngInfo(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 26 || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('is not a valid PNG');
  }
  const colorType = buffer[25];
  let hasTransparencyChunk = false;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'tRNS') hasTransparencyChunk = true;
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return {
    format: 'png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType,
    hasAlpha: colorType === 4 || colorType === 6 || hasTransparencyChunk,
  };
}

function jpegInfo(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('is not a valid JPEG');
  }
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrame.has(marker)) {
      return {
        format: 'jpeg',
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        colorType: null,
        hasAlpha: false,
      };
    }
    offset += segmentLength;
  }
  throw new Error('does not contain a JPEG size marker');
}

async function imageInfo(file) {
  const buffer = await fs.readFile(file);
  const extension = path.extname(file).toLowerCase();
  let info;
  if (extension === '.png') info = pngInfo(buffer);
  else if (['.jpg', '.jpeg'].includes(extension)) info = jpegInfo(buffer);
  else throw new Error('must be a PNG or JPEG');
  return { ...info, bytes: buffer.length };
}

async function sha256(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function parseEnv(text) {
  const result = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid define line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (result.has(key)) throw new Error(`Duplicate define: ${key}`);
    result.set(key, value);
  }
  return result;
}

function parsePubspecVersion(text) {
  const match = text.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\+([1-9][0-9]*)\s*$/m);
  if (!match) throw new Error('pubspec.yaml must declare version as semantic-version+positive-build.');
  return { versionName: match[1], buildNumber: Number(match[2]) };
}

function decisionIsApproved(record) {
  return record?.status === 'owner-approved' && record.answer !== null &&
    characterLength(record.approvedBy) > 0 && characterLength(record.approvedAt) > 0 &&
    Array.isArray(record.evidence) && record.evidence.length > 0;
}

export async function verifyStoreListing({
  root = process.cwd(),
  metadataPath = 'store/listing-metadata.json',
  mode = 'prepared',
  platform = 'all',
  version = null,
  buildNumber = null,
  definesPath = null,
} = {}) {
  if (!['prepared', 'submission'].includes(mode)) throw new Error('Invalid store mode.');
  if (!['android', 'ios', 'all'].includes(platform)) throw new Error('Invalid store platform.');
  const platforms = selectedPlatforms(platform);
  const blockers = [];
  const checks = [];
  const blockerIds = new Set();
  const block = (requestedId, message) => {
    let id = requestedId;
    let suffix = 2;
    while (blockerIds.has(id)) {
      id = `${requestedId}-${suffix}`;
      suffix += 1;
    }
    blockerIds.add(id);
    blockers.push({ id, message });
  };
  const pass = (id, detail) => checks.push({ id, detail });
  const absolute = (relative) => path.resolve(root, relative);

  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(absolute(metadataPath), 'utf8'));
  } catch (error) {
    throw new StoreListingError([
      { id: 'metadata', message: `Cannot read ${metadataPath}: ${error.message}` },
    ]);
  }

  if (metadata.schemaVersion !== 2) block('metadata-schema', 'schemaVersion must be 2.');
  else pass('metadata-schema', 'schema version 2');
  if (!Array.isArray(metadata.release?.interfaceLanguages) || !metadata.release.interfaceLanguages.includes('uz')) {
    block('interface-languages', 'The declared app interface languages must include Uzbek (uz).');
  }

  const urls = metadata.urls || {};
  for (const key of requiredUrlKeys) {
    if (!Object.prototype.hasOwnProperty.call(urls, key)) {
      block(`url-${key}`, `${key} URL is required.`);
    } else if (!isPublicHttps(urls[key])) {
      block(`url-${key}`, `${key} must use public HTTPS without credentials or private hosts.`);
    }
  }
  if (!blockers.some(({ id }) => id.startsWith('url-'))) {
    pass('public-urls', `${requiredUrlKeys.length} required public HTTPS URLs declared`);
  }

  let pubspecVersion;
  try {
    pubspecVersion = parsePubspecVersion(await fs.readFile(absolute('pubspec.yaml'), 'utf8'));
    if (
      metadata.release?.versionName !== pubspecVersion.versionName ||
      Number(metadata.release?.buildNumber) !== pubspecVersion.buildNumber
    ) {
      block(
        'release-version',
        `Listing ${metadata.release?.versionName}+${metadata.release?.buildNumber} does not match pubspec ${pubspecVersion.versionName}+${pubspecVersion.buildNumber}.`,
      );
    }
    if (version && version !== pubspecVersion.versionName) {
      block('release-requested-version', `Requested version ${version} does not match ${pubspecVersion.versionName}.`);
    }
    if (buildNumber && Number(buildNumber) !== pubspecVersion.buildNumber) {
      block('release-requested-build', `Requested build ${buildNumber} does not match ${pubspecVersion.buildNumber}.`);
    }
    if (!blockers.some(({ id }) => id.startsWith('release-'))) {
      pass('release-version', `${pubspecVersion.versionName}+${pubspecVersion.buildNumber}`);
    }
  } catch (error) {
    block('release-version', error.message);
  }

  if (definesPath) {
    try {
      const defines = parseEnv(await fs.readFile(absolute(definesPath), 'utf8'));
      const mappings = {
        API_BASE_URL: 'marketing',
        PRIVACY_POLICY_URL: 'privacy',
        TERMS_OF_SERVICE_URL: 'terms',
        ACCOUNT_DELETION_URL: 'accountDeletion',
        SUPPORT_URL: 'support',
      };
      for (const [define, urlKey] of Object.entries(mappings)) {
        const value = defines.get(define);
        if (!value || !isPublicHttps(value) || normalizedUrl(value) !== normalizedUrl(urls[urlKey])) {
          block(`defines-${define.toLowerCase()}`, `${define} must equal listing URL ${urlKey}.`);
        }
      }
      if (!blockers.some(({ id }) => id.startsWith('defines-'))) {
        pass('release-defines', `${definesPath} matches canonical listing URLs`);
      }
    } catch (error) {
      block('defines-file', `Cannot verify ${definesPath}: ${error.message}`);
    }
  }

  const expectedAndroidId = 'uz.milana.milana_flutter';
  const expectedIosId = 'uz.milana.milanaFlutter';
  if (platforms.includes('android')) {
    const androidGradle = await fs.readFile(absolute('android/app/build.gradle.kts'), 'utf8');
    if (
      metadata.identity?.androidApplicationId !== expectedAndroidId ||
      !androidGradle.includes(`applicationId = "${expectedAndroidId}"`)
    ) block('android-identity', 'Listing Android application ID does not match the app.');
    else pass('android-identity', expectedAndroidId);
  }
  if (platforms.includes('ios')) {
    const iosProject = await fs.readFile(absolute('ios/Runner.xcodeproj/project.pbxproj'), 'utf8');
    if (
      metadata.identity?.iosBundleId !== expectedIosId ||
      !iosProject.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${expectedIosId};`)
    ) block('ios-identity', 'Listing iOS bundle ID does not match the app.');
    else pass('ios-identity', expectedIosId);
  }

  const playLocales = Object.entries(metadata.googlePlay?.localizations || {});
  if (platforms.includes('android')) {
    if (!playLocales.some(([locale]) => locale === metadata.googlePlay?.defaultLocale)) {
      block('android-default-locale', 'Google Play default locale must have listing copy.');
    }
    for (const [locale, listing] of playLocales) {
      const prefix = `android-copy-${locale}`;
      if (!supportedListingLocales.has(locale)) block(`${prefix}-locale`, `${locale} is not an approved Milana Play listing locale.`);
      if (!listing.name || characterLength(listing.name) > 30) block(`${prefix}-name`, 'Play name must contain 1–30 characters.');
      if (!listing.shortDescription || characterLength(listing.shortDescription) > 80 || listing.shortDescription.includes('\n')) {
        block(`${prefix}-short`, 'Play short description must be one line and at most 80 characters.');
      }
      for (const [field, limit] of [['fullDescriptionFile', 4000], ['releaseNotesFile', 500]]) {
        try {
          const content = (await fs.readFile(absolute(listing[field]), 'utf8')).trim();
          if (!content || characterLength(content) > limit) block(`${prefix}-${field}`, `${field} must contain 1–${limit} characters.`);
        } catch (error) {
          block(`${prefix}-${field}`, `Cannot read ${listing[field]}: ${error.message}`);
        }
      }
    }
    if (!blockers.some(({ id }) => id.startsWith('android-copy-') || id === 'android-default-locale')) {
      pass('google-play-copy', `${playLocales.length} locale(s) within field limits`);
    }
  }

  const appStoreLocales = Object.entries(metadata.appStore?.localizations || {});
  if (platforms.includes('ios')) {
    if (!appStoreLocales.some(([locale]) => locale === metadata.appStore?.primaryLocale)) {
      block('ios-primary-locale', 'App Store primary locale must have listing copy.');
    }
    for (const [locale, listing] of appStoreLocales) {
      const prefix = `ios-copy-${locale}`;
      if (!supportedListingLocales.has(locale)) block(`${prefix}-locale`, `${locale} is not an approved Milana App Store locale.`);
      if (!listing.name || characterLength(listing.name) < 2 || characterLength(listing.name) > 30) block(`${prefix}-name`, 'App Store name must contain 2–30 characters.');
      if (!listing.subtitle || characterLength(listing.subtitle) > 30) block(`${prefix}-subtitle`, 'App Store subtitle must contain 1–30 characters.');
      if (listing.promotionalText && characterLength(listing.promotionalText) > 170) block(`${prefix}-promotional-text`, 'App Store promotional text exceeds 170 characters.');
      if (!listing.keywords || Buffer.byteLength(listing.keywords, 'utf8') > 100) block(`${prefix}-keywords`, 'App Store keywords must contain at most 100 UTF-8 bytes.');
      if (!isPublicHttps(listing.supportUrl) || !isPublicHttps(listing.marketingUrl)) block(`${prefix}-urls`, 'App Store URLs must use public HTTPS.');
      else if (normalizedUrl(listing.supportUrl) !== normalizedUrl(urls.support) || normalizedUrl(listing.marketingUrl) !== normalizedUrl(urls.marketing)) {
        block(`${prefix}-urls`, 'Localized App Store URLs must equal canonical listing URLs.');
      }
      try {
        const description = (await fs.readFile(absolute(listing.descriptionFile), 'utf8')).trim();
        if (!description || characterLength(description) > 4000) block(`${prefix}-description`, 'App Store description must contain 1–4000 characters.');
      } catch (error) {
        block(`${prefix}-description`, `Cannot read ${listing.descriptionFile}: ${error.message}`);
      }
    }
    if (!blockers.some(({ id }) => id.startsWith('ios-copy-') || id === 'ios-primary-locale')) {
      pass('app-store-copy', `${appStoreLocales.length} locale(s) within field limits`);
    }
  }

  if (platforms.includes('android')) {
    try {
      const icon = await imageInfo(absolute(metadata.googlePlay.graphics.icon));
      if (icon.format !== 'png' || icon.width !== 512 || icon.height !== 512 || !icon.hasAlpha || icon.bytes > 1_048_576) {
        block('android-play-icon', 'Play icon must be a 512×512 PNG with alpha, at most 1024 KB.');
      } else pass('play-icon', `${icon.width}×${icon.height}, ${icon.bytes} bytes`);
    } catch (error) {
      block('android-play-icon', `Cannot validate Play icon: ${error.message}`);
    }
    try {
      const feature = await imageInfo(absolute(metadata.googlePlay.graphics.featureGraphic));
      if (!['png', 'jpeg'].includes(feature.format) || feature.width !== 1024 || feature.height !== 500 || feature.hasAlpha) {
        block('android-feature-graphic', 'Feature graphic must be a 1024×500 JPEG or PNG without alpha.');
      } else if (metadata.googlePlay.graphics.featureGraphicLocale !== 'universal-text-free') {
        block('android-feature-graphic-locale', 'The shared feature graphic must be declared universal-text-free.');
      } else pass('play-feature-graphic', `${feature.width}×${feature.height}, text-free, no alpha`);
    } catch (error) {
      block('android-feature-graphic', `Cannot validate feature graphic: ${error.message}`);
    }
    try {
      const altText = await fs.readFile(absolute(metadata.googlePlay.graphics.altTextFile), 'utf8');
      const descriptions = altText.split('\n').filter((line) => line.startsWith('- `')).map((line) => line.slice(line.indexOf(':') + 1).trim());
      if (descriptions.length < 2 || descriptions.some((value) => !value || characterLength(value) > 140)) block('android-alt-text', 'Icon and feature graphic need alt text of at most 140 characters.');
      else pass('play-alt-text', `${descriptions.length} accessible descriptions`);
    } catch (error) {
      block('android-alt-text', `Cannot read graphic alt text: ${error.message}`);
    }
  }

  for (const requiredDocument of ['store/PRIVACY_DATA_INVENTORY.md', 'store/REVIEW_NOTES.md', 'store/SCREENSHOT_PLAN.md']) {
    try {
      const text = await fs.readFile(absolute(requiredDocument), 'utf8');
      if (text.trim().length < 200) throw new Error('document is incomplete');
    } catch (error) {
      block(`documentation-${path.basename(requiredDocument).toLowerCase()}`, `${requiredDocument}: ${error.message}`);
    }
  }

  const records = {};
  const requiredRecordKeys = ['questionnaires', 'privacyData', 'releaseDecisions', 'assetRights', 'reviewInformation', 'screenshotManifest'];
  for (const key of requiredRecordKeys) {
    const recordPath = metadata.records?.[key];
    try {
      if (!recordPath) throw new Error('path is missing');
      records[key] = JSON.parse(await fs.readFile(absolute(recordPath), 'utf8'));
      if (records[key].schemaVersion !== 1) throw new Error('schemaVersion must be 1');
    } catch (error) {
      block(`record-${key}`, `Cannot validate ${recordPath || key}: ${error.message}`);
    }
  }
  if (!blockers.some(({ id }) => id.startsWith('record-'))) pass('structured-records', `${requiredRecordKeys.length} structured release records loaded`);

  const validateDecision = (record, prefix) => {
    if (!record || !['unknown', 'not-applicable', 'owner-approved'].includes(record.status)) {
      block(`${prefix}-status`, 'Decision status must be unknown, not-applicable, or owner-approved.');
      return;
    }
    const approvedAt = record.approvedAt ? Date.parse(record.approvedAt) : NaN;
    if (record.status === 'unknown') {
      if (record.approvedBy !== null || record.approvedAt !== null) block(`${prefix}-unknown-approval`, 'Unknown decisions cannot include approval metadata.');
      return;
    }
    if (record.answer === null || !record.approvedBy || !Number.isFinite(approvedAt) || approvedAt > Date.now() || !Array.isArray(record.evidence) || record.evidence.length === 0) {
      block(`${prefix}-approval`, 'Resolved decisions require an answer, evidence, approver, and non-future approval time.');
    }
    if (record.status === 'not-applicable' && !String(record.rationale || '').trim()) block(`${prefix}-rationale`, 'Not-applicable decisions require a rationale.');
  };
  const validateRequiredIds = (rows, requiredIds, prefix) => {
    const ids = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row.id || ids.has(row.id)) block(`${prefix}-duplicate-id`, `Decision IDs must be present and unique; found ${row.id || '(missing)'}.`);
      ids.add(row.id);
      validateDecision(row, `${prefix}-${row.id || 'missing'}`);
    }
    for (const id of requiredIds) if (!ids.has(id)) block(`${prefix}-missing-${id}`, `Required decision ${id} is missing.`);
  };

  if (records.questionnaires) {
    validateRequiredIds(records.questionnaires.global, requiredQuestionnaireIds.global, 'global-questionnaire');
    for (const selected of platforms) {
      validateRequiredIds(records.questionnaires[platformSection[selected]], requiredQuestionnaireIds[selected], `${selected}-questionnaire`);
    }
  }
  if (records.releaseDecisions) {
    for (const selected of platforms) {
      validateRequiredIds(records.releaseDecisions[platformSection[selected]], requiredDecisionIds[selected], `${selected}-decision`);
    }
  }

  const rightsById = new Map();
  if (records.assetRights) {
    for (const asset of records.assetRights.assets || []) {
      if (!asset.id || rightsById.has(asset.id)) block('asset-rights-duplicate-id', `Asset rights IDs must be unique; found ${asset.id || '(missing)'}.`);
      rightsById.set(asset.id, asset);
      validateDecision(asset.approval, `asset-rights-${asset.id || 'missing'}`);
      const verifyHash = async (file, expected, id) => {
        if (!file) return;
        try {
          const actual = await sha256(absolute(file));
          if (!/^[a-f0-9]{64}$/.test(expected || '') || actual !== expected) block(id, `${file} does not match its recorded SHA-256.`);
        } catch (error) {
          block(id, `Cannot verify ${file}: ${error.message}`);
        }
      };
      await verifyHash(asset.sourcePath, asset.sourceSha256, `asset-rights-${asset.id}-source`);
      for (const derived of asset.derivedAssets || []) await verifyHash(derived.path, derived.sha256, `asset-rights-${asset.id}-derived-${path.basename(derived.path || 'missing')}`);
    }
    for (const required of ['app-icon-artwork', 'hero-model-photo', 'anticva-display-font', 'app-ui-captures']) {
      if (!rightsById.has(required)) block(`asset-rights-missing-${required}`, `Required rights record ${required} is missing.`);
    }
  }

  if (records.privacyData) {
    validateDecision(records.privacyData.inventoryStatus, 'privacy-inventory');
    const sdkRows = records.privacyData.sdkRows || [];
    for (const selected of platforms) {
      for (const dependency of ['firebase_auth', 'cloud_firestore', 'cloud_functions']) {
        const row = sdkRows.find((candidate) => candidate.platform === selected && candidate.dependency === dependency);
        if (!row) {
          block(`${selected}-privacy-${dependency}`, `Privacy inventory is missing ${dependency} for ${selected}.`);
          continue;
        }
        validateDecision(row.classification, `${selected}-privacy-${dependency}`);
      }
    }
  }

  const reviewByPlatform = {};
  if (records.reviewInformation) {
    if (records.reviewInformation.containsSecrets !== false) block('review-info-secrets', 'Review metadata must explicitly exclude secrets.');
    for (const selected of platforms) {
      const review = records.reviewInformation[platformSection[selected]];
      reviewByPlatform[selected] = review;
      if (!review) block(`${selected}-review-info`, 'Review information is missing.');
      else {
        validateDecision(review.readiness, `${selected}-review-readiness`);
        for (const reference of Object.values(review.credentialRefs || {})) {
          if (!/^[A-Z][A-Z0-9_]+$/.test(reference || '')) block(`${selected}-review-credential-ref`, 'Credential references must be non-secret uppercase identifiers.');
        }
      }
    }
  }

  const screenshotSets = records.screenshotManifest?.sets || [];
  const screenshotIds = new Set();
  for (const set of screenshotSets) {
    if (!set.id || screenshotIds.has(set.id)) block('screenshot-duplicate-id', `Screenshot set IDs must be unique; found ${set.id || '(missing)'}.`);
    screenshotIds.add(set.id);
    if (!['android', 'ios'].includes(set.platform)) block(`screenshot-${set.id}-platform`, 'Screenshot platform must be android or ios.');
    if (!supportedListingLocales.has(set.locale)) block(`screenshot-${set.id}-locale`, `${set.locale} is not an approved listing locale.`);
    validateDecision(set.approval, `screenshot-${set.id}`);
  }

  if (mode === 'submission') {
    const requireApprovedRows = (rows, ids, prefix) => {
      for (const id of ids) {
        const record = (rows || []).find((candidate) => candidate.id === id);
        if (!decisionIsApproved(record)) block(`submission-${prefix}-${id}`, `${id} requires owner approval with evidence.`);
      }
    };
    requireApprovedRows(records.questionnaires?.global, requiredQuestionnaireIds.global, 'global-questionnaire');
    if (!decisionIsApproved(records.privacyData?.inventoryStatus)) block('submission-privacy-inventory', 'The production privacy inventory is not owner-approved.');

    for (const selected of platforms) {
      const section = platformSection[selected];
      requireApprovedRows(records.questionnaires?.[section], requiredQuestionnaireIds[selected], `${selected}-questionnaire`);
      requireApprovedRows(records.releaseDecisions?.[section], requiredDecisionIds[selected], `${selected}-decision`);

      const listingRows = selected === 'android' ? playLocales : appStoreLocales;
      for (const [locale, listing] of listingRows) {
        if (listing.copyApproved !== true) block(`submission-${selected}-copy-${locale}`, `${locale} ${selected} listing copy is not approved.`);
      }

      const review = reviewByPlatform[selected];
      if (!decisionIsApproved(review?.readiness)) block(`submission-${selected}-review`, `${selected} review access is not approved.`);
      for (const field of ['name', 'email', 'phone']) {
        if (!String(review?.contact?.[field] || '').trim()) block(`submission-${selected}-review-contact-${field}`, `${selected} reviewer contact ${field} is missing.`);
      }

      for (const row of records.privacyData?.sdkRows || []) {
        if (row.platform !== selected) continue;
        const unresolved = ['collected', 'shared', 'linkedToUser', 'usedForTracking', 'required'].some((key) => row[key] === null) ||
          !Array.isArray(row.purposes) || row.purposes.length === 0 || !row.retention || !row.deletion || !decisionIsApproved(row.classification);
        if (unresolved) block(`submission-${selected}-privacy-${row.dependency}`, `${row.id} still has unresolved disclosure fields.`);
      }

      for (const assetId of ['app-icon-artwork', 'hero-model-photo', 'anticva-display-font', 'app-ui-captures']) {
        const asset = rightsById.get(assetId);
        if (!asset) continue;
        if (!(asset.platforms || []).includes(selected)) block(`submission-${selected}-rights-scope-${asset.id}`, `${asset.id} does not declare ${selected} distribution rights.`);
        if (!decisionIsApproved(asset.approval)) block(`submission-${selected}-rights-${asset.id}`, `${asset.id} rights are not owner-approved.`);
        if (asset.containsRecognizablePeople && !asset.modelReleaseReference) block(`submission-${selected}-model-release-${asset.id}`, `${asset.id} needs model-release evidence.`);
      }

      const primaryLocale = selected === 'android' ? metadata.googlePlay?.defaultLocale : metadata.appStore?.primaryLocale;
      const requiredSetIds = selected === 'android'
        ? [`google-play-phone-${primaryLocale}`]
        : [`app-store-iphone-${primaryLocale}`, `app-store-ipad-${primaryLocale}`];
      const requiredSets = requiredSetIds
        .map((id) => screenshotSets.find((set) => set.id === id && set.platform === selected))
        .filter(Boolean);
      for (const id of requiredSetIds) {
        if (!requiredSets.some((set) => set.id === id)) block(`submission-${selected}-screenshots-${id}-missing`, `Required screenshot set ${id} is missing.`);
      }
      for (const set of requiredSets) {
        if (!decisionIsApproved(set.approval)) block(`submission-${selected}-screenshots-${set.id}-approval`, `${set.id} is not owner-approved.`);
        const images = Array.isArray(set.images) ? set.images : [];
        const requiredMinimum = selected === 'android' ? 4 : 1;
        const requiredMaximum = selected === 'android' ? 8 : 10;
        if (images.length < requiredMinimum || images.length > requiredMaximum) {
          block(`submission-${selected}-screenshots-${set.id}-count`, `${set.id} requires ${requiredMinimum}–${requiredMaximum} manifest images; found ${images.length}.`);
        }
        let diskFiles = [];
        try {
          diskFiles = (await fs.readdir(absolute(set.directory))).filter((file) => /\.(png|jpe?g)$/i.test(file)).sort();
        } catch {
          // The manifest count reports a missing directory without hiding the blocker.
        }
        const manifestFiles = images.map((image) => image.file).filter(Boolean).sort();
        if (JSON.stringify(diskFiles) !== JSON.stringify(manifestFiles)) block(`submission-${selected}-screenshots-${set.id}-files`, `${set.id} manifest and directory files differ.`);
        const orders = new Set();
        for (const image of images) {
          const prefix = `submission-${selected}-screenshot-${set.id}-${image.file || 'missing'}`;
          if (!image.file || path.basename(image.file) !== image.file) {
            block(`${prefix}-filename`, 'Screenshot filename is missing or unsafe.');
            continue;
          }
          if (!Number.isInteger(image.order) || orders.has(image.order)) block(`${prefix}-order`, 'Screenshot order must be a unique integer.');
          orders.add(image.order);
          if (!String(image.scene || '').trim() || !String(image.caption || '').trim() || !String(image.altText || '').trim() || characterLength(image.altText) > 140) block(`${prefix}-copy`, 'Screenshot scene, caption, and alt text are required; alt text is limited to 140 characters.');
          if (image.buildVersion !== metadata.release.versionName || Number(image.buildNumber) !== Number(metadata.release.buildNumber)) block(`${prefix}-version`, 'Screenshot build version does not match listing metadata.');
          if (image.capture?.source !== 'physical-device' || !image.capture?.deviceModel || !image.capture?.osVersion || !image.capture?.capturedAt) block(`${prefix}-capture`, 'Screenshot requires physical-device provenance.');
          if (image.syntheticDataConfirmed !== true) block(`${prefix}-synthetic-data`, 'Screenshot must confirm synthetic customer data.');
          if (!rightsById.has(image.rightsId)) block(`${prefix}-rights`, 'Screenshot references an unknown rights record.');
          try {
            const file = path.join(absolute(set.directory), image.file);
            const info = await imageInfo(file);
            const actualHash = await sha256(file);
            if (!/^[a-f0-9]{64}$/.test(image.sha256 || '') || actualHash !== image.sha256) block(`${prefix}-hash`, 'Screenshot SHA-256 is missing or incorrect.');
            if (selected === 'android') {
              const expected = [1080, 1920];
              const exactSize = (info.width === expected[0] && info.height === expected[1]) || (info.width === expected[1] && info.height === expected[0]);
              if (!exactSize) block(`${prefix}-size`, `Play screenshots must use ${expected[0]}×${expected[1]} or landscape equivalent.`);
              if (info.hasAlpha || (info.format === 'png' && info.colorType !== 2)) block(`${prefix}-alpha`, 'Play screenshots must be JPEG or 24-bit RGB PNG without alpha.');
            } else {
              const accepted = set.acceptedPortraitSizes || [];
              const acceptedSize = accepted.some(([width, height]) => (info.width === width && info.height === height) || (info.width === height && info.height === width));
              if (!acceptedSize) block(`${prefix}-size`, 'App Store screenshot size is unsupported.');
              if (info.hasAlpha) block(`${prefix}-alpha`, 'App Store screenshots cannot contain alpha.');
            }
          } catch (error) {
            block(`${prefix}-file`, `Cannot validate screenshot: ${error.message}`);
          }
        }
      }

      if (selected === 'android') {
        if (!/^\S+@\S+\.\S+$/.test(metadata.googlePlay?.contactEmail || '')) block('submission-android-contact-email', 'Google Play requires a public contact email.');
      } else {
        if (!metadata.appStore?.sku) block('submission-ios-sku', 'App Store SKU is not set.');
        if (!metadata.appStore?.copyright) block('submission-ios-copyright', 'App Store copyright owner is not set.');
      }
    }
  }

  if (blockers.length) throw new StoreListingError(blockers, checks);
  return { ok: true, mode, platform, checks };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  try {
    const report = await verifyStoreListing(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (!(error instanceof StoreListingError)) throw error;
    console.error(JSON.stringify({
      ok: false,
      mode: options.mode,
      platform: options.platform,
      checks: error.checks,
      blockers: error.blockers,
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
