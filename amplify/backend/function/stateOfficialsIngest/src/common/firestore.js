/**
 * Shared Firestore/Firebase helpers. Reused across all Politicker Lambdas.
 * Service-account base64 is stored in SSM Parameter Store (/politicker/firebase/sa-b64)
 * so Amplify pushes can't overwrite it.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

let firestore;
let cachedB64;

async function fetchServiceAccountBase64() {
  if (cachedB64) return cachedB64;
  const envB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (envB64 && envB64 !== 'placeholder' && envB64.length > 100) {
    cachedB64 = envB64;
    return cachedB64;
  }
  const paramName = process.env.FIREBASE_SA_SSM_PARAM || '/politicker/firebase/sa-b64';
  const ssm = new SSMClient({ region: process.env.REGION || process.env.AWS_REGION });
  const resp = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  cachedB64 = resp.Parameter?.Value;
  if (!cachedB64) throw new Error(`SSM parameter ${paramName} is empty`);
  return cachedB64;
}

async function getFirestore() {
  if (firestore) return firestore;
  const b64 = await fetchServiceAccountBase64();
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(creds) });
  firestore = admin.firestore();
  return firestore;
}

/**
 * Tokenize a name for array-contains searches:
 *   "Robert Wittman" -> ["robert", "wittman"]
 *   "Wittman, Rob"   -> ["wittman", "rob"]
 */
function nameTokens(name) {
  return Array.from(new Set((name || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 2)));
}

/** Deterministic SHA-1 ID trimmed to 20 chars. */
function makeId(...parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 20);
}

/** Normalize locality: trim, title-case, ensure suffix. Returns null for empty/junk. */
function normalizeLocality(raw) {
  if (!raw) return { locality: null, localityLower: null };
  let loc = String(raw).trim()
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '')
    .replace(/^(?:the|county of|city of)\s+/i, '');
  if (loc.length < 2 || loc.length > 80) return { locality: null, localityLower: null };
  // Reject strings that are clearly not localities
  if (/^(n\/a|none|unknown|null|undefined|vacant|tbd|see|click|http|www\.)$/i.test(loc)) return { locality: null, localityLower: null };
  const lower = loc.toLowerCase().replace(/\s+(county|parish|borough|city|township|municipality)$/i, '').trim();
  return { locality: loc, localityLower: lower || null };
}

/**
 * Clean and validate a person name. Returns cleaned name or null if junk.
 * Strips titles, suffixes, and rejects non-name strings.
 */
function cleanName(raw) {
  if (!raw) return null;
  let name = String(raw).trim()
    .replace(/\s+/g, ' ')
    .replace(/[""'']/g, '')
    // Strip common titles/prefixes
    .replace(/^(Sheriff|Judge|Hon\.?|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Commissioner|Supervisor|Chair|Vice Chair|Chairperson|Chairwoman|Chairman|Chief|Mayor|Representative|Senator|Officer|Deputy|Honorable|The)\s+/i, '')
    // Strip suffixes (including ordinals like "3rd", "2nd")
    .replace(/,?\s+(Jr\.?|Sr\.?|III?|IV|1st|2nd|3rd|4th|Esq\.?|Ph\.?D\.?|M\.?D\.?|Ed\.?D\.?|DDS|Ret\.?)$/i, '')
    // Remove parenthetical notes
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim();

  if (!name || name.length < 3 || name.length > 60) return null;
  // Must have at least 2 words (first + last name)
  if (name.split(/\s+/).length < 2) return null;
  // Must start with an uppercase letter
  if (!/^[A-Z]/.test(name)) return null;
  // Reject known non-name strings
  const JUNK = /^(Board Of|County Of|City Of|State Of|District|Office|Department|Phone|Email|Address|Website|Click Here|Read More|Learn More|Contact Us|Vacant|Position|To Be|Under|See |No |Not |Page|Home|About|Member|Staff|Team|Search|View|Download|Submit|Apply|Print|Share|Follow|Subscribe|Sign|Login|Register|Select|Choose|Enter|Please|Thank)/i;
  if (JUNK.test(name)) return null;
  // Reject UI/nav/structural text that looks like capitalized words
  const UI_JUNK = /\b(Menu|Toggle|Close|Find Your|Skip|Content|Streaming|Meeting|Highlight|Navigation|Footer|Header|Sidebar|Cookie|Privacy|Copyright|Newsletter|Calendar|Agenda|Minutes|Report|Annual|Budget|Schedule|Election|Ordinance|Resolution|Notice|Alert|Update|Categories|Interest|Technical|Education Board|County Board|School Board|School District|Independent School|Public Schools|Commissioners Court|City Council$|Council Members|Board Meeting|City Council Member|Article Link|Early Childhood|Health Services|Human Services|Public Works|Public Safety|Community Development|Social Services|Information Technology|General Services|Emergency Management|Animal|Pets|Building Permit|Program|Main Article|Link Article|Government Relations|Public Relations|External Affairs|Legislative Affairs|Media Relations|Community Relations|Constituent Services|Customer Service)\b/i;
  if (UI_JUNK.test(name)) return null;
  // Reject strings with 3+ words where last word looks like a city/place (address fragments)
  if (name.split(/\s+/).length >= 3 && /\b(Lane|Street|Avenue|Drive|Road|Blvd|Boulevard|Court|Place|Way|Circle|Suite|Floor)\b/i.test(name)) return null;
  // Reject strings with digits (addresses, phone numbers mixed in)
  if (/\d/.test(name)) return null;
  // Reject strings with too many special chars
  if (name.replace(/[A-Za-z\s.''-]/g, '').length > 2) return null;
  return name;
}

/**
 * Strip null/undefined values from an object so merge:true only touches fields
 * that have real data.
 */
function stripNulls(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = stripNulls(v);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Primary writer — used by Socrata and per-state deep scrapers.
 * Full merge:true write; nulls are stripped so they don't blank existing fields.
 * Returns number of docs written.
 */
async function batchedWrite(collectionName, items) {
  if (!items || items.length === 0) return 0;
  const db = await getFirestore();
  const col = db.collection(collectionName);
  const now = admin.firestore.FieldValue.serverTimestamp();
  let batch = db.batch();
  let count = 0;
  for (const { id, data } of items) {
    const cleaned = stripNulls(data);
    batch.set(col.doc(id), { ...cleaned, lastUpdated: now }, { merge: true });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
  return count;
}

/**
 * Gap-fill writer — used by Wikidata, AllStates, national sheriffs.
 * Only creates docs that don't already exist. Never touches Socrata data.
 * Checks existence in batches of 100 (Firestore getAll limit), then writes
 * only the new ones.
 * Returns number of NEW docs written (skipped count logged).
 */
async function batchedGapFill(collectionName, items) {
  if (!items || items.length === 0) return 0;
  const db = await getFirestore();
  const col = db.collection(collectionName);
  const now = admin.firestore.FieldValue.serverTimestamp();

  let written = 0;
  let skipped = 0;
  const CHUNK = 100; // Firestore getAll limit

  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const refs = chunk.map(({ id }) => col.doc(id));
    const snapshots = await db.getAll(...refs);

    // Collect items whose docs don't exist yet
    const newItems = [];
    for (let j = 0; j < chunk.length; j++) {
      if (snapshots[j].exists) {
        skipped++;
      } else {
        newItems.push(chunk[j]);
      }
    }

    // Batch-write only the new ones
    if (newItems.length > 0) {
      let batch = db.batch();
      let batchCount = 0;
      for (const { id, data } of newItems) {
        const cleaned = stripNulls(data);
        batch.set(col.doc(id), { ...cleaned, lastUpdated: now });
        batchCount++;
        written++;
        if (batchCount % 400 === 0) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();
    }
  }

  if (skipped > 0) console.log(`  gap-fill: ${written} new, ${skipped} skipped (already exist)`);
  return written;
}

module.exports = { getFirestore, nameTokens, makeId, normalizeLocality, cleanName, batchedWrite, batchedGapFill, admin };
