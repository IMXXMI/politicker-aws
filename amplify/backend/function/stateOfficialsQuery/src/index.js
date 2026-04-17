/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * HTTP query endpoint for the `stateOfficials` Firestore collection.
 * Lambda Function URL (AuthType NONE, CORS *).
 *
 * Query params (all optional):
 *   state    (2-letter, e.g. 'VA')
 *   category ('sheriff' | 'state-judge' | 'school-board' | 'county-board' | ...)
 *   locality (substring, case-insensitive, client-filtered after page fetch)
 *   member   (name-token prefix, server-side via array-contains)
 *   cursor   (doc ID to start after)
 *   limit    (default 50, max 200)
 */

const admin = require('firebase-admin');
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

function json(statusCode, body) {
  // CORS headers set by Function URL — do not duplicate here
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const db = await getFirestore();
    let q = db.collection('stateOfficials');

    if (params.state) q = q.where('state', '==', String(params.state).toUpperCase().slice(0, 2));
    if (params.category) q = q.where('category', '==', String(params.category).toLowerCase());

    if (params.member) {
      const firstToken = String(params.member).toLowerCase().split(/\s+/).filter(Boolean)[0];
      if (firstToken && firstToken.length >= 2) {
        q = q.where('nameTokens', 'array-contains', firstToken);
      }
    }

    q = q.orderBy(admin.firestore.FieldPath.documentId());

    // Locality filtering happens after fetch — normalize both sides at read time
    const localityNeedle = params.locality
      ? String(params.locality).toLowerCase().replace(/\s+(county|parish|borough|city)$/i, '').trim()
      : null;

    // If locality filter active, fetch more docs so we can filter client-side
    const limit = localityNeedle ? 5000 : Math.min(parseInt(params.limit, 10) || 50, 200);
    if (params.cursor) {
      const snap = await db.collection('stateOfficials').doc(String(params.cursor)).get();
      if (snap.exists) q = q.startAfter(snap);
    }
    q = q.limit(limit);

    const snap = await q.get();
    let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Client-side locality filter on the fetched results
    if (localityNeedle) {
      results = results.filter((r) => {
        const loc = (r.locality || '').toLowerCase().replace(/\s+(county|parish|borough|city)$/i, '').trim();
        return loc === localityNeedle;
      });
    }

    const userLimit = Math.min(parseInt(params.limit, 10) || 50, 200);
    const trimmed = results.slice(0, userLimit);
    const nextCursor = trimmed.length === userLimit ? trimmed[trimmed.length - 1].id : null;
    return json(200, { results: trimmed, nextCursor, total: null });
  } catch (err) {
    console.error('stateOfficialsQuery error:', err);
    return json(500, { error: err.message });
  }
};
