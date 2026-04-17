/**
 * National-scale scraper using Wikidata SPARQL.
 * Single query returns all US county-level officials that Wikidata knows about:
 *   - Sheriffs, county executives, county commissioners/supervisors, judges, treasurers, clerks, etc.
 * Coverage: ~30-60% of US counties have at least one official in Wikidata. Larger counties are
 * better covered. Small rural counties may have zero entries.
 *
 * This is a seed layer — per-state scrapers (like VA) add deeper coverage on top.
 */
const { nameTokens, makeId } = require('../../common/firestore');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// Run separate simple queries per category to avoid Wikidata timeout on complex UNIONs.
// Each returns officials who currently hold a position (no end date).
const QUERIES = [
  {
    label: 'sheriffs',
    sparql: `SELECT ?person ?personLabel ?positionLabel ?jurisdictionLabel WHERE {
      ?person p:P39 ?stmt.
      ?stmt ps:P39 ?position.
      ?position wdt:P31/wdt:P279* wd:Q104692.
      FILTER NOT EXISTS { ?stmt pq:P582 ?end. }
      OPTIONAL { ?stmt pq:P642 ?jurisdiction. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 3000`,
  },
  {
    label: 'judges',
    sparql: `SELECT ?person ?personLabel ?positionLabel ?jurisdictionLabel WHERE {
      ?person p:P39 ?stmt.
      ?stmt ps:P39 ?position.
      ?position wdt:P31/wdt:P279* wd:Q16533.
      ?person wdt:P27 wd:Q30.
      FILTER NOT EXISTS { ?stmt pq:P582 ?end. }
      OPTIONAL { ?stmt pq:P642 ?jurisdiction. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 3000`,
  },
  {
    label: 'county-executives',
    sparql: `SELECT ?person ?personLabel ?positionLabel ?jurisdictionLabel WHERE {
      ?person p:P39 ?stmt.
      ?stmt ps:P39 ?position.
      { ?position wdt:P31/wdt:P279* wd:Q382844. } UNION
      { ?position wdt:P31/wdt:P279* wd:Q13423495. }
      ?person wdt:P27 wd:Q30.
      FILTER NOT EXISTS { ?stmt pq:P582 ?end. }
      OPTIONAL { ?stmt pq:P642 ?jurisdiction. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 3000`,
  },
];

function categorizePosition(posLabel) {
  const p = (posLabel || '').toLowerCase();
  if (p.includes('sheriff')) return { category: 'sheriff', office: 'Sheriff' };
  if (p.includes('judge') || p.includes('justice') || p.includes('magistrate')) return { category: 'state-judge', office: posLabel };
  if (p.includes('school') || p.includes('education')) return { category: 'school-board', office: posLabel };
  if (p.includes('treasurer')) return { category: 'county-board', office: 'County Treasurer' };
  if (p.includes('clerk')) return { category: 'county-board', office: 'County Clerk' };
  if (p.includes('commissioner') || p.includes('supervisor') || p.includes('executive') || p.includes('council')) return { category: 'county-board', office: posLabel };
  return { category: 'county-board', office: posLabel || 'County Official' };
}

// State label → 2-letter code
const STATE_CODES = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO',
  'connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID',
  'illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA',
  'maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
  'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',
  'tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA',
  'west virginia':'WV','wisconsin':'WI','wyoming':'WY',
};

async function runSparql(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'politicker-scraper/1.0 (civic data aggregation; contact: admin@politickerapp.com)',
    },
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL returned ${res.status}`);
  return res.json();
}

async function scrape() {
  // Run each category query separately to stay under Wikidata's timeout
  let allBindings = [];
  for (const q of QUERIES) {
    try {
      console.log(`  Wikidata query: ${q.label}...`);
      const data = await runSparql(q.sparql);
      const bindings = data?.results?.bindings || [];
      console.log(`  Wikidata ${q.label}: ${bindings.length} results`);
      allBindings.push(...bindings);
    } catch (e) {
      console.warn(`  Wikidata ${q.label} failed: ${e.message}`);
    }
  }

  const bindings = allBindings;
  console.log(`Wikidata total bindings: ${bindings.length}`);

  const items = [];
  const seen = new Set();

  for (const b of bindings) {
    const name = b.personLabel?.value;
    if (!name || name.startsWith('Q')) continue; // skip unresolved QIDs

    const posLabel = b.positionLabel?.value || '';
    const jurisdictionLabel = b.jurisdictionLabel?.value || '';
    const stateLabel = (b.stateLabel?.value || '').toLowerCase();
    const stateCode = STATE_CODES[stateLabel];
    if (!stateCode) continue;

    const { category, office } = categorizePosition(posLabel);
    const key = `${stateCode}|${name}|${office}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      id: makeId(stateCode, category, jurisdictionLabel.toLowerCase(), name.toLowerCase()),
      data: {
        category,
        state: stateCode,
        locality: jurisdictionLabel || null,
        office,
        name,
        nameTokens: nameTokens(name),
        party: null,
        tookOffice: b.startDate?.value?.slice(0, 10) || null,
        termEnds: null,
        contact: {},
        photo: b.image?.value || null,
        sourceUrl: b.person?.value || 'https://www.wikidata.org',
        castsVotes: category !== 'sheriff',
        voteRecordsUrl: null,
      },
    });
  }

  // Breakdown by state
  const byState = {};
  for (const it of items) {
    byState[it.data.state] = (byState[it.data.state] || 0) + 1;
  }
  console.log(`Wikidata national total: ${items.length} officials across ${Object.keys(byState).length} states`);
  const top5 = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('Top 5 states:', top5.map(([s, n]) => `${s}:${n}`).join(', '));

  return items;
}

module.exports = { scrape };
