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

/**
 * Batched Firestore writer. items: [{ id, data }]. Uses merge:true for idempotency.
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
    batch.set(col.doc(id), { ...data, lastUpdated: now }, { merge: true });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
  return count;
}

module.exports = { getFirestore, nameTokens, makeId, batchedWrite, admin };
