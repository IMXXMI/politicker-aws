#!/usr/bin/env node
/**
 * Coverage audit — queries Firestore stateOfficials collection and prints a matrix
 * showing which states have data for each category, plus locality fill rate.
 *
 * Usage:
 *   node coverage.js                  # full audit
 *   node coverage.js --state IL       # single state detail
 *   node coverage.js --empty          # only show states with 0 in any category
 *   node coverage.js --json           # output as JSON
 */
const { getFirestore } = require('../common/firestore');

const ALL_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
const CATEGORIES = ['sheriff', 'state-judge', 'school-board', 'county-board'];

async function run() {
  const args = process.argv.slice(2);
  const onlyState = args.includes('--state') ? args[args.indexOf('--state') + 1]?.toUpperCase() : null;
  const onlyEmpty = args.includes('--empty');
  const asJson = args.includes('--json');

  const db = await getFirestore();
  const col = db.collection('stateOfficials');

  // Fetch ALL docs (just the fields we need) in a single streaming query
  console.error('Fetching all stateOfficials docs...');
  const snap = await col.select('state', 'category', 'locality', 'localityLower', 'name').get();
  console.error(`Total docs: ${snap.size}`);

  // Build stats
  const stats = {}; // { IL: { sheriff: { total: N, withLocality: N, names: [...] }, ... } }
  for (const doc of snap.docs) {
    const d = doc.data();
    const st = d.state;
    const cat = d.category;
    if (!st || !cat) continue;

    if (!stats[st]) stats[st] = {};
    if (!stats[st][cat]) stats[st][cat] = { total: 0, withLocality: 0, withLocalityLower: 0, sampleNames: [] };
    const bucket = stats[st][cat];
    bucket.total++;
    if (d.locality) bucket.withLocality++;
    if (d.localityLower) bucket.withLocalityLower++;
    if (bucket.sampleNames.length < 3) bucket.sampleNames.push(d.name);
  }

  // Single state detail
  if (onlyState) {
    const st = stats[onlyState] || {};
    console.log(`\n=== ${onlyState} ===`);
    for (const cat of CATEGORIES) {
      const b = st[cat];
      if (!b) { console.log(`  ${cat.padEnd(14)} 0`); continue; }
      const locPct = b.total > 0 ? Math.round(100 * b.withLocality / b.total) : 0;
      console.log(`  ${cat.padEnd(14)} ${String(b.total).padStart(4)}  locality:${locPct}%  samples: ${b.sampleNames.join(', ')}`);
    }
    // Show any extra categories
    for (const cat of Object.keys(st)) {
      if (!CATEGORIES.includes(cat)) {
        console.log(`  ${cat.padEnd(14)} ${String(st[cat].total).padStart(4)}  (extra category)`);
      }
    }
    return;
  }

  // JSON output
  if (asJson) {
    const out = {};
    for (const st of ALL_STATES) {
      out[st] = {};
      for (const cat of CATEGORIES) {
        const b = stats[st]?.[cat];
        out[st][cat] = b ? { total: b.total, withLocality: b.withLocality } : { total: 0, withLocality: 0 };
      }
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // Matrix view
  const header = '  ST  ' + CATEGORIES.map(c => c.padStart(13)).join('') + '   locality%';
  console.log(header);
  console.log('-'.repeat(header.length));

  let totalDocs = 0;
  let totalWithLoc = 0;
  const emptyStates = [];

  for (const st of ALL_STATES) {
    const row = stats[st] || {};
    const cells = CATEGORIES.map(cat => {
      const b = row[cat];
      return String(b ? b.total : 0).padStart(13);
    });

    // Overall locality fill for this state
    let stTotal = 0, stLoc = 0;
    for (const cat of CATEGORIES) {
      const b = row[cat];
      if (b) { stTotal += b.total; stLoc += b.withLocality; }
    }
    totalDocs += stTotal;
    totalWithLoc += stLoc;
    const locPct = stTotal > 0 ? Math.round(100 * stLoc / stTotal) : 0;
    const hasEmpty = CATEGORIES.some(cat => !row[cat] || row[cat].total === 0);

    if (onlyEmpty && !hasEmpty) continue;
    if (hasEmpty) emptyStates.push(st);

    const flag = hasEmpty ? ' *' : '';
    console.log(`  ${st}  ${cells.join('')}   ${String(locPct).padStart(3)}%${flag}`);
  }

  console.log('-'.repeat(header.length));
  const overallLocPct = totalDocs > 0 ? Math.round(100 * totalWithLoc / totalDocs) : 0;
  console.log(`  Total docs: ${totalDocs}  |  Locality fill: ${overallLocPct}%  |  States with gaps: ${emptyStates.length}`);
  if (emptyStates.length > 0) {
    console.log(`  Empty in at least 1 category: ${emptyStates.join(', ')}`);
  }
  console.log('\n  * = has 0 in at least one category');
}

run().catch((e) => { console.error(e); process.exit(1); });
