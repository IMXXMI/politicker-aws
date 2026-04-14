/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	FIREBASE_SERVICE_ACCOUNT_BASE64
Amplify Params - DO NOT EDIT */

/**
 * Daily scraper for House + Senate floor schedules.
 * Writes upcoming bill considerations into Firestore collection `upcomingVotes`.
 *
 * Runs on a daily schedule via EventBridge (configured in Amplify).
 */

const admin = require('firebase-admin');

// --- Firebase init (lazy, reused across warm invocations) ---
let firestore;
function getFirestore() {
  if (firestore) return firestore;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64 || b64 === 'placeholder') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 env var not set');
  }
  const credsJson = Buffer.from(b64, 'base64').toString('utf8');
  const creds = JSON.parse(credsJson);
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  }
  firestore = admin.firestore();
  return firestore;
}

// --- Date helpers ---
function toYYYYMMDD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function getMondayOfWeek(d = new Date()) {
  const copy = new Date(d);
  const day = copy.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

// --- House: try multiple sources. Weekly XML (when published) is most structured;
//     RSS feed and the floor HTML page always respond.
async function scrapeHouse() {
  // 1) Weekly XML for this + prior 3 Mondays (when Leadership has published a schedule)
  const monday = getMondayOfWeek();
  for (let i = 0; i <= 3; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    const yyyymmdd = toYYYYMMDD(d);
    const url = `https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/${yyyymmdd}/Bills${yyyymmdd}.xml`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const xml = await res.text();
        const items = parseHouseXml(xml);
        if (items.length > 0) {
          console.log(`House XML parsed for week of ${yyyymmdd}: ${items.length} bills`);
          return items.map((it) => ({ ...it, scheduledWeek: yyyymmdd }));
        }
      } else {
        console.log(`House XML ${yyyymmdd}: ${res.status}`);
      }
    } catch (e) {
      console.warn(`House XML fetch error for ${yyyymmdd}:`, e.message);
    }
  }

  // 2) RSS fallback
  try {
    const res = await fetch('https://docs.house.gov/floor/RSS.ashx', {
      headers: { 'User-Agent': 'Mozilla/5.0 (politicker-scraper)' },
    });
    if (res.ok) {
      const rss = await res.text();
      const items = parseHouseRss(rss);
      if (items.length > 0) {
        console.log(`House RSS parsed: ${items.length} items`);
        return items;
      }
    } else {
      console.log('House RSS status:', res.status);
    }
  } catch (e) {
    console.warn('House RSS error:', e.message);
  }

  // 3) Scrape the docs.house.gov/floor/ main page (always exists)
  try {
    const res = await fetch('https://docs.house.gov/floor/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (politicker-scraper)' },
    });
    if (res.ok) {
      const html = await res.text();
      const items = parseHouseHtml(html);
      console.log(`House HTML parsed: ${items.length} items`);
      return items;
    }
  } catch (e) {
    console.warn('House HTML error:', e.message);
  }

  return [];
}

function parseHouseXml(xml) {
  const out = [];
  const itemRegex = /<floor-item[^>]*>([\s\S]*?)<\/floor-item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const billId = (block.match(/<legis-num[^>]*>\s*([^<]+?)\s*<\/legis-num>/) || [])[1] || '';
    const title = (block.match(/<short-title[^>]*>\s*([\s\S]*?)\s*<\/short-title>/) || [])[1] ||
                  (block.match(/<description[^>]*>\s*([\s\S]*?)\s*<\/description>/) || [])[1] || '';
    if (billId || title) {
      out.push({
        chamber: 'house',
        billId: billId.trim(),
        title: title.replace(/<[^>]+>/g, '').trim(),
        source: 'docs.house.gov',
      });
    }
  }
  return out;
}

function parseHouseRss(rss) {
  const out = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(rss)) !== null) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                   block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const billIdMatch = title.match(/\b(H\.?\s?R\.?\s?\d+|H\.?\s?Res\.?\s?\d+|H\.?\s?J\.?\s?Res\.?\s?\d+|H\.?\s?Con\.?\s?Res\.?\s?\d+)\b/i);
    out.push({
      chamber: 'house',
      billId: billIdMatch ? billIdMatch[1].replace(/\s+/g, '').toUpperCase() : '',
      title: title.trim().slice(0, 300),
      source: 'docs.house.gov/rss',
    });
  }
  return out;
}

function parseHouseHtml(html) {
  const out = [];
  const seen = new Set();
  const billRegex = /\b(H\.?\s?R\.?\s?\d+|H\.?\s?Res\.?\s?\d+|H\.?\s?J\.?\s?Res\.?\s?\d+|H\.?\s?Con\.?\s?Res\.?\s?\d+)\b[^<.]{0,200}/gi;
  let m;
  while ((m = billRegex.exec(html)) !== null) {
    const billId = m[1].replace(/\s+/g, '').toUpperCase();
    if (seen.has(billId)) continue;
    seen.add(billId);
    const context = m[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({
      chamber: 'house',
      billId,
      title: context.slice(0, 250),
      source: 'docs.house.gov',
    });
  }
  return out;
}

// --- Senate: scrape the Majority Leader's weekly schedule HTML ---
async function scrapeSenate() {
  const url = 'https://www.majorityleader.gov/content/weekly-schedule';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (politicker-scraper)' } });
    if (!res.ok) {
      console.warn('Senate fetch returned', res.status);
      return [];
    }
    const html = await res.text();
    return parseSenateHtml(html);
  } catch (e) {
    console.warn('Senate fetch error:', e.message);
    return [];
  }
}

function parseSenateHtml(html) {
  // Senate Majority Leader's page lists bills in prose.
  // Heuristic: pull S.### / S.J.Res.### / H.R.### mentions with surrounding text.
  const out = [];
  const billRegex = /\b(S\.?\s?J\.?\s?Res\.?\s?\d+|S\.?\s?Con\.?\s?Res\.?\s?\d+|H\.?\s?R\.?\s?\d+|S\.?\s?\d+)\b[^<.]{0,200}/gi;
  const seen = new Set();
  let m;
  while ((m = billRegex.exec(html)) !== null) {
    const billId = m[1].replace(/\s+/g, '').toUpperCase();
    if (seen.has(billId)) continue;
    seen.add(billId);
    const context = m[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({
      chamber: 'senate',
      billId,
      title: context.slice(0, 250),
      source: 'majorityleader.gov',
    });
  }
  console.log(`Senate schedule parsed: ${out.length} bills`);
  return out;
}

// --- Firestore write ---
async function writeToFirestore(items) {
  if (items.length === 0) return { written: 0 };
  const db = getFirestore();
  const col = db.collection('upcomingVotes');

  // Wipe current upcoming set so we don't accumulate stale entries
  const existing = await col.get();
  const deleteBatch = db.batch();
  existing.forEach((doc) => deleteBatch.delete(doc.ref));
  if (!existing.empty) await deleteBatch.commit();

  // Write new items
  const writeBatch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const item of items) {
    const id = `${item.chamber}_${(item.billId || item.title || Math.random().toString(36).slice(2)).replace(/[^A-Z0-9]/gi, '_').slice(0, 120)}`;
    writeBatch.set(col.doc(id), { ...item, scrapedAt: now });
  }
  await writeBatch.commit();
  return { written: items.length };
}

// --- Voteview: bulk CSV data for per-member roll-call votes ---
// Source: voteview.com (UCLA). Free, public, no API key.
// We download current-Congress House + Senate CSVs, map ICPSR → bioguide, and store
// the last 20 votes per member in Firestore at `memberVotes/{bioguide_id}`.
const CURRENT_CONGRESS = 119; // 119th Congress (2025-2027)

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const vals = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j];
    out.push(row);
  }
  return out;
}

function castCodeToPosition(code) {
  const n = parseInt(code, 10);
  if (n >= 1 && n <= 3) return 'Yea';
  if (n >= 4 && n <= 6) return 'Nay';
  if (n === 7 || n === 8) return 'Present';
  return 'Not Voting';
}

async function fetchVoteviewCsv(path) {
  const url = `https://voteview.com/static/data/out/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Voteview fetch ${path}: ${res.status}`);
    return '';
  }
  return res.text();
}

// Parse voteview's bill_number format to Congress.gov API parts
// Examples we see: "H R 1234", "HR 1234", "S 567", "S J RES 12", "H CON RES 5"
function parseBillRef(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, '').replace(/\s+/g, '').toUpperCase();
  const m = cleaned.match(/^(HCONRES|SCONRES|HJRES|SJRES|HRES|SRES|HR|S)(\d+)$/);
  if (!m) return null;
  const typeMap = { HR: 'hr', S: 's', HRES: 'hres', SRES: 'sres', HJRES: 'hjres', SJRES: 'sjres', HCONRES: 'hconres', SCONRES: 'sconres' };
  const type = typeMap[m[1]];
  if (!type) return null;
  return { type, number: m[2], canonical: `${m[1]}${m[2]}` };
}

// Look up human-readable titles for a set of bill references via Congress.gov.
// Returns { "HR1234": "Short Title of HR 1234", ... }
async function fetchBillTitles(billRefs, congress) {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    console.warn('CONGRESS_API_KEY not set — skipping bill title enrichment');
    return {};
  }
  const unique = Array.from(new Set(billRefs.filter(Boolean)));
  console.log(`Looking up titles for ${unique.length} unique bills`);
  const titleMap = {};
  let count = 0;

  // Run 6 at a time to stay well under Congress.gov's 5000/hr free limit
  const concurrency = 6;
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    await Promise.all(batch.map(async (ref) => {
      const parsed = parseBillRef(ref);
      if (!parsed) return;
      const url = `https://api.congress.gov/v3/bill/${congress}/${parsed.type}/${parsed.number}?format=json&api_key=${encodeURIComponent(apiKey)}`;
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const data = await r.json();
        const title = data?.bill?.title || data?.bill?.shortTitle || data?.bill?.titles?.[0]?.title;
        if (title) {
          titleMap[parsed.canonical] = String(title).slice(0, 300);
          count++;
        }
      } catch (e) {
        // swallow — missing title just falls back to bill number
      }
    }));
  }
  console.log(`Bill title lookup: ${count} / ${unique.length} resolved`);
  return titleMap;
}

async function scrapeVoteviewForChamber(chamberLetter, chamberName) {
  const [membersCsv, rollcallsCsv, votesCsv] = await Promise.all([
    fetchVoteviewCsv(`members/${chamberLetter}${CURRENT_CONGRESS}_members.csv`),
    fetchVoteviewCsv(`rollcalls/${chamberLetter}${CURRENT_CONGRESS}_rollcalls.csv`),
    fetchVoteviewCsv(`votes/${chamberLetter}${CURRENT_CONGRESS}_votes.csv`),
  ]);

  if (!membersCsv || !rollcallsCsv || !votesCsv) {
    console.warn(`Voteview ${chamberName}: missing one or more CSVs`);
    return {};
  }

  const members = parseCsv(membersCsv);
  const icpsrToBioguide = {};
  for (const m of members) {
    if (m.bioguide_id && m.icpsr) icpsrToBioguide[m.icpsr] = m.bioguide_id;
  }

  const rollcalls = parseCsv(rollcallsCsv);
  const rollcallMap = {};
  for (const rc of rollcalls) rollcallMap[rc.rollnumber] = rc;

  // Collect unique bill refs from the MOST RECENT 50 roll calls (cap API calls)
  const sortedRcs = [...rollcalls].sort((a, b) => (parseInt(b.rollnumber, 10) || 0) - (parseInt(a.rollnumber, 10) || 0));
  const recentBillRefs = sortedRcs.slice(0, 50).map((rc) => rc.bill_number).filter(Boolean);
  const titleMap = await fetchBillTitles(recentBillRefs, CURRENT_CONGRESS);

  const votes = parseCsv(votesCsv);
  const perMember = {};
  for (const v of votes) {
    const bioguide = icpsrToBioguide[v.icpsr];
    if (!bioguide) continue;
    const rc = rollcallMap[v.rollnumber];
    if (!rc) continue;
    if (!perMember[bioguide]) perMember[bioguide] = [];
    const parsed = parseBillRef(rc.bill_number || '');
    const title = parsed ? (titleMap[parsed.canonical] || '') : '';
    perMember[bioguide].push({
      rollnumber: parseInt(v.rollnumber, 10) || 0,
      date: rc.date || '',
      chamber: chamberName,
      bill: rc.bill_number || '',
      title, // human-readable bill title (may be empty if unresolved)
      description: (rc.vote_desc || rc.vote_question || '').slice(0, 300),
      position: castCodeToPosition(v.cast_code),
      congress: CURRENT_CONGRESS,
    });
  }

  // Keep last 20 votes per member (highest rollnumber = most recent)
  for (const bioguide of Object.keys(perMember)) {
    perMember[bioguide].sort((a, b) => b.rollnumber - a.rollnumber);
    perMember[bioguide] = perMember[bioguide].slice(0, 20);
  }

  console.log(`Voteview ${chamberName}: ${Object.keys(perMember).length} members with votes`);
  return perMember;
}

async function writeMemberVotes(perMemberMap) {
  const db = getFirestore();
  const col = db.collection('memberVotes');
  const entries = Object.entries(perMemberMap);
  if (entries.length === 0) return 0;

  let batch = db.batch();
  let count = 0;
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const [bioguide, recent] of entries) {
    batch.set(col.doc(bioguide), { recent, updatedAt: now }, { merge: true });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
  return count;
}

// --- Handler ---
exports.handler = async (event) => {
  console.log('floorScheduleScraper invoked:', event?.source || 'manual');
  const result = { ok: true };
  try {
    // 1) Floor schedules (existing) — enrich with real bill titles via Congress.gov
    const [house, senate] = await Promise.all([scrapeHouse(), scrapeSenate()]);
    const all = [...house, ...senate];
    console.log(`Floor items: ${all.length} (house: ${house.length}, senate: ${senate.length})`);

    const refsToLookup = all.map((it) => it.billId).filter(Boolean);
    if (refsToLookup.length > 0) {
      const titleMap = await fetchBillTitles(refsToLookup, CURRENT_CONGRESS);
      for (const it of all) {
        const parsed = parseBillRef(it.billId || '');
        if (parsed && titleMap[parsed.canonical]) {
          it.title = titleMap[parsed.canonical]; // overwrite scraped/heuristic title with real one
        }
      }
    }

    const schedRes = await writeToFirestore(all);
    result.floor = { ...schedRes, house: house.length, senate: senate.length };

    // 2) Voting history (voteview — House + Senate)
    const [housePerMember, senatePerMember] = await Promise.all([
      scrapeVoteviewForChamber('H', 'house'),
      scrapeVoteviewForChamber('S', 'senate'),
    ]);
    const merged = { ...housePerMember, ...senatePerMember };
    const voteCount = await writeMemberVotes(merged);
    result.memberVotes = { membersWritten: voteCount };
    console.log(`memberVotes: wrote ${voteCount} member docs`);
  } catch (err) {
    console.error('Scraper error:', err);
    result.ok = false;
    result.error = err.message;
    return { statusCode: 500, body: JSON.stringify(result) };
  }
  return { statusCode: 200, body: JSON.stringify(result) };
};
