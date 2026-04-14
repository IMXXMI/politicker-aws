/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	FIREBASE_SERVICE_ACCOUNT_BASE64
Amplify Params - DO NOT EDIT */

/**
 * Weekly ingest of House Community Project Funding (CPF) earmark disclosures.
 * Scrapes appropriations.house.gov to discover Excel file URLs, parses them with xlsx,
 * normalizes rows to a standard schema, and writes to Firestore collection `earmarks`.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT_BASE64 - base64-encoded Firebase service account JSON
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// ---------- Firebase init (lazy, reused across warm invocations) ----------
// Pulls the base64 service account from SSM Parameter Store so Amplify pushes can't overwrite it.
// SSM param name: FIREBASE_SA_SSM_PARAM env var (default /politicker/firebase/sa-b64).
let firestore;
let cachedB64;
async function fetchServiceAccountBase64() {
  if (cachedB64) return cachedB64;
  // Env var takes priority (dev override); otherwise fetch from SSM.
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

// ---------- CPF page discovery ----------
// House restructures URLs per Congress. These are the confirmed CPF landing pages per FY as of 2026.
// The scraper pulls every .xlsx link out. If the House moves a page again, the archive index
// (last entry) should still link to the current locations.
const CPF_INDEX_PAGES = [
  'https://appropriations.house.gov/fy22-community-project-funding',
  'https://appropriations.house.gov/member-requests/fy23-community-project-funding',
  'https://appropriations.house.gov/fiscal-year-2024-community-project-funding',
  'https://appropriations.house.gov/committee-activity/fy25-community-project-funding',
  'https://appropriations.house.gov/fy26-member-requests/fy26-community-project-funding',
  'https://appropriations.house.gov/fy27-information/fy27-community-project-funding',
  // Archive hub — links to all the above (good fallback if any FY page moves)
  'https://appropriations.house.gov/committee-activity/archived-community-project-funding',
];

async function discoverExcelUrls() {
  const found = new Set();
  for (const page of CPF_INDEX_PAGES) {
    try {
      const res = await fetch(page, { headers: { 'User-Agent': 'politicker-earmarks-scraper/1.0' } });
      if (!res.ok) { console.warn(`CPF index ${page}: ${res.status}`); continue; }
      const html = await res.text();
      // Match absolute and relative .xlsx links
      const linkRegex = /href="([^"]+\.xlsx)"/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        let url = m[1];
        if (url.startsWith('//')) url = 'https:' + url;
        else if (url.startsWith('/')) url = 'https://appropriations.house.gov' + url;
        found.add(url);
      }
    } catch (e) {
      console.warn(`CPF scrape error for ${page}:`, e.message);
    }
  }
  console.log(`Discovered ${found.size} candidate .xlsx URLs`);
  return Array.from(found);
}

// ---------- Fiscal year inference from URL/filename ----------
function inferFiscalYear(url) {
  // Try explicit "FY25" / "FY 2025" / "/2025/" patterns
  const u = url.toLowerCase();
  const fyShort = u.match(/fy\s*(\d{2})/);
  if (fyShort) {
    const yy = parseInt(fyShort[1], 10);
    return yy < 50 ? 2000 + yy : 1900 + yy;
  }
  const full = u.match(/\b(20\d{2})\b/);
  if (full) return parseInt(full[1], 10);
  return null;
}

// ---------- Column name normalization ----------
// House files vary column names across FYs. We map aliases to a canonical key.
const COLUMN_ALIASES = {
  memberName: ['member', 'member name', 'requestor', 'requesting member', 'member_name'],
  state: ['state', 'st', 'state abbreviation'],
  district: ['district', 'cd', 'congressional district', 'dist'],
  party: ['party'],
  recipientName: ['recipient', 'recipient name', 'requesting entity', 'grantee', 'awardee'],
  recipientAddress: ['recipient address', 'address', 'grantee address'],
  projectTitle: ['project', 'project title', 'project name', 'description', 'purpose'],
  amount_requested: ['amount requested', 'requested amount', 'request amount', 'amount_requested'],
  amount_enacted: ['amount enacted', 'enacted amount', 'enacted', 'final amount', 'appropriated amount'],
  amount_obligated: ['amount obligated', 'obligated amount', 'obligated'],
  agency: ['agency', 'department'],
  account: ['account', 'bureau/account', 'appropriation account'],
  billName: ['bill', 'bill name', 'bill title', 'appropriations bill'],
  publicLaw: ['public law', 'p.l.', 'pl number', 'public law number'],
  status: ['status'],
};

function buildHeaderMap(headers) {
  // headers: array of raw column names from row 0
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[()]/g, '').trim();
  const map = {};
  const normalized = headers.map(norm);
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i])) { map[canonical] = headers[i]; break; }
    }
  }
  return map;
}

function toNumberOrNull(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  // Strip $ and commas
  const clean = String(v).replace(/[$,\s]/g, '');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

function statusFrom(url, rawStatus) {
  if (rawStatus) return String(rawStatus).toLowerCase();
  const u = url.toLowerCase();
  if (u.includes('enacted') || u.includes('final')) return 'enacted';
  if (u.includes('obligat')) return 'obligated';
  if (u.includes('request')) return 'requested';
  return 'unknown';
}

// ---------- Parse one Excel file into normalized rows ----------
async function fetchAndParseXlsx(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'politicker-earmarks-scraper/1.0' } });
  if (!res.ok) {
    console.warn(`Fetch failed ${url}: ${res.status}`);
    return [];
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    // Parse as array-of-arrays so we can detect the true header row
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (aoa.length < 2) continue;

    // Scan first 5 rows for a row that contains recognizable headers
    let headerIdx = 0;
    for (let i = 0; i < Math.min(aoa.length, 5); i++) {
      const hMap = buildHeaderMap(aoa[i]);
      if (hMap.memberName || hMap.recipientName || hMap.projectTitle) { headerIdx = i; break; }
    }
    const headers = aoa[headerIdx];
    const hMap = buildHeaderMap(headers);
    if (!hMap.memberName && !hMap.recipientName && !hMap.projectTitle) continue; // skip sheet

    const colIndex = (canonical) => {
      const colName = hMap[canonical];
      if (!colName) return -1;
      return headers.indexOf(colName);
    };

    const idx = {
      memberName: colIndex('memberName'),
      state: colIndex('state'),
      district: colIndex('district'),
      party: colIndex('party'),
      recipientName: colIndex('recipientName'),
      recipientAddress: colIndex('recipientAddress'),
      projectTitle: colIndex('projectTitle'),
      amount_requested: colIndex('amount_requested'),
      amount_enacted: colIndex('amount_enacted'),
      amount_obligated: colIndex('amount_obligated'),
      agency: colIndex('agency'),
      account: colIndex('account'),
      billName: colIndex('billName'),
      publicLaw: colIndex('publicLaw'),
      status: colIndex('status'),
    };

    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const r = aoa[i];
      if (!r || r.every((v) => v === '' || v == null)) continue;
      const memberName = idx.memberName >= 0 ? String(r[idx.memberName] || '').trim() : '';
      const recipientName = idx.recipientName >= 0 ? String(r[idx.recipientName] || '').trim() : '';
      const projectTitle = idx.projectTitle >= 0 ? String(r[idx.projectTitle] || '').trim() : '';
      if (!memberName && !recipientName && !projectTitle) continue; // junk row

      const row = {
        memberName,
        state: idx.state >= 0 ? String(r[idx.state] || '').trim().toUpperCase().slice(0, 2) : '',
        district: idx.district >= 0 ? String(r[idx.district] || '').trim() || null : null,
        party: idx.party >= 0 ? String(r[idx.party] || '').trim() || null : null,
        recipientName,
        recipientAddress: idx.recipientAddress >= 0 ? String(r[idx.recipientAddress] || '').trim() || null : null,
        projectTitle,
        amount_requested: toNumberOrNull(idx.amount_requested >= 0 ? r[idx.amount_requested] : null),
        amount_enacted: toNumberOrNull(idx.amount_enacted >= 0 ? r[idx.amount_enacted] : null),
        amount_obligated: toNumberOrNull(idx.amount_obligated >= 0 ? r[idx.amount_obligated] : null),
        agency: idx.agency >= 0 ? String(r[idx.agency] || '').trim() || null : null,
        account: idx.account >= 0 ? String(r[idx.account] || '').trim() || null : null,
        billName: idx.billName >= 0 ? String(r[idx.billName] || '').trim() || null : null,
        publicLaw: idx.publicLaw >= 0 ? String(r[idx.publicLaw] || '').trim() || null : null,
        status: idx.status >= 0 ? String(r[idx.status] || '').trim().toLowerCase() || null : null,
      };
      rows.push(row);
    }
  }
  return rows;
}

// ---------- Firestore writer ----------
async function writeEarmarks(docs) {
  if (docs.length === 0) return 0;
  const db = await getFirestore();
  const col = db.collection('earmarks');
  const now = admin.firestore.FieldValue.serverTimestamp();

  let batch = db.batch();
  let count = 0;
  for (const d of docs) {
    batch.set(col.doc(d.id), { ...d.data, lastUpdated: now }, { merge: true });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
  return count;
}

// ---------- Handler ----------
exports.handler = async (event) => {
  console.log('earmarksIngest invoked:', event?.source || 'manual');
  const summary = { ok: true, files: 0, docs: 0, perFile: [] };

  try {
    const urls = await discoverExcelUrls();
    if (urls.length === 0) {
      console.warn('No CPF .xlsx URLs discovered — index pages may have changed structure');
      return { statusCode: 200, body: JSON.stringify({ ...summary, warning: 'no urls discovered' }) };
    }

    for (const url of urls) {
      try {
        const fy = inferFiscalYear(url);
        const rows = await fetchAndParseXlsx(url);
        const normalized = rows.map((row, idx) => {
          const hash = crypto.createHash('sha1').update(`${fy}|${url}|${idx}|${row.memberName}|${row.projectTitle}`).digest('hex').slice(0, 20);
          return {
            id: `FY${fy || 'UNK'}-${hash}`,
            data: {
              fiscalYear: fy,
              chamber: 'house',
              status: row.status || statusFrom(url, null),
              memberName: row.memberName,
              memberNameLower: (row.memberName || '').toLowerCase(),
              state: row.state,
              district: row.district,
              party: row.party,
              recipientName: row.recipientName,
              recipientAddress: row.recipientAddress,
              projectTitle: row.projectTitle,
              amount_requested: row.amount_requested,
              amount_enacted: row.amount_enacted,
              amount_obligated: row.amount_obligated,
              agency: row.agency,
              account: row.account,
              billName: row.billName,
              publicLaw: row.publicLaw,
              sourceUrl: url,
            },
          };
        });
        const written = await writeEarmarks(normalized);
        summary.files++;
        summary.docs += written;
        summary.perFile.push({ url, fy, rows: rows.length, written });
        console.log(`FY${fy} ${url}: ${rows.length} rows → ${written} written`);
      } catch (e) {
        console.warn(`Failed ${url}:`, e.message);
        summary.perFile.push({ url, error: e.message });
      }
    }

    console.log(`Done: ${summary.files} files, ${summary.docs} docs`);
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (err) {
    console.error('earmarksIngest fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
