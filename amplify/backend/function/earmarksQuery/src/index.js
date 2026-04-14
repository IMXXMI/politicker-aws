/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	FIREBASE_SERVICE_ACCOUNT_BASE64
Amplify Params - DO NOT EDIT */

/**
 * HTTP query endpoint for the `earmarks` Firestore collection.
 * Invoked via Lambda Function URL (AuthType NONE, CORS *).
 *
 * Query params (all optional):
 *   fiscalYear (number)
 *   state (2-letter, case-insensitive)
 *   member (name prefix, case-insensitive, server-side via memberNameLower range)
 *   status ('requested' | 'enacted' | 'obligated' | 'unknown')
 *   minAmount, maxAmount (applied to amount_enacted)
 *   cursor (doc ID to start after, for pagination)
 *   limit (default 50, max 200)
 */

const admin = require('firebase-admin');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// Service-account base64 lives in SSM so Amplify pushes can't overwrite it.
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
  // CORS headers are injected by the Lambda Function URL's own CORS config — do NOT duplicate here,
  // otherwise browsers see double Access-Control-Allow-Origin values and reject the response.
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const db = await getFirestore();
    let q = db.collection('earmarks');

    // Equality filters (composite-index friendly)
    if (params.fiscalYear != null && params.fiscalYear !== '') {
      const fy = parseInt(params.fiscalYear, 10);
      if (Number.isFinite(fy)) q = q.where('fiscalYear', '==', fy);
    }
    if (params.state) q = q.where('state', '==', String(params.state).toUpperCase().slice(0, 2));
    if (params.status) q = q.where('status', '==', String(params.status).toLowerCase());

    // Token match on memberNameTokens — matches any word in the name regardless of order.
    // Accepts space-separated terms; first term is used for the array-contains filter (Firestore
    // allows only one array-contains per query).
    if (params.member) {
      const firstToken = String(params.member).toLowerCase().split(/\s+/).filter(Boolean)[0];
      if (firstToken && firstToken.length >= 2) {
        q = q.where('memberNameTokens', 'array-contains', firstToken);
      }
    }

    // Amount range on amount_enacted (requires composite index with any other where)
    const minAmt = params.minAmount != null && params.minAmount !== '' ? parseFloat(params.minAmount) : null;
    const maxAmt = params.maxAmount != null && params.maxAmount !== '' ? parseFloat(params.maxAmount) : null;
    if (minAmt != null && Number.isFinite(minAmt)) q = q.where('amount_enacted', '>=', minAmt);
    if (maxAmt != null && Number.isFinite(maxAmt)) q = q.where('amount_enacted', '<=', maxAmt);

    // Always order stably so cursors work
    q = q.orderBy(admin.firestore.FieldPath.documentId());

    // Pagination
    const limit = Math.min(parseInt(params.limit, 10) || 50, 200);
    if (params.cursor) {
      const cursorSnap = await db.collection('earmarks').doc(String(params.cursor)).get();
      if (cursorSnap.exists) q = q.startAfter(cursorSnap);
    }
    q = q.limit(limit);

    const snap = await q.get();
    const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = results.length === limit ? results[results.length - 1].id : null;

    return json(200, { results, nextCursor, total: null });
  } catch (err) {
    console.error('earmarksQuery error:', err);
    return json(500, { error: err.message });
  }
};
