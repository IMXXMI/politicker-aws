/**
 * CA sheriffs scraper — California State Sheriffs' Association directory page
 * lists all 58 county sheriffs. Parse the directory for sheriff names + counties.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');

const SOURCE_URL = 'https://www.calsheriffs.org/sheriffs-directory';

async function scrape() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'politicker-scraper/1.0' } });
  if (!res.ok) throw new Error(`calsheriffs.org returned ${res.status}`);
  const html = await res.text();

  const items = [];
  const seen = new Set();

  // Strategy 1: Look for structured blocks (cards, list items) with county + sheriff name
  // The directory typically lists entries like "County: Sheriff Name" or structured divs
  const blockRegex = /<(?:div|li|tr|article|section)[^>]*>([\s\S]*?)<\/(?:div|li|tr|article|section)>/gi;
  let m;
  const blocks = [];
  while ((m = blockRegex.exec(html)) !== null) {
    blocks.push(m[1]);
  }

  // Strategy 2: Pull all <td> cells and try grouping (similar to VA pattern)
  const cells = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  while ((m = cellRegex.exec(html)) !== null) {
    cells.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  // Try table-based extraction first (2-column: County | Sheriff Name)
  if (cells.length >= 2) {
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const county = cells[i].trim();
      const sheriffRaw = cells[i + 1].trim();
      if (!county || !sheriffRaw) continue;
      // Skip header rows
      if (/county/i.test(county) && /sheriff/i.test(sheriffRaw) && county.length < 10) continue;
      addSheriff(items, seen, county, sheriffRaw);
    }
  }

  // Strategy 3: Regex-based extraction for common directory patterns
  // Match patterns like "County Name\nSheriff: First Last" or "County - Sheriff First Last"
  if (items.length === 0) {
    // Try pattern: heading with county name, followed by sheriff name
    const entryRegex = /(?:<h[2-5][^>]*>|<strong>|<b>)\s*([\w\s]+?)\s*County\s*(?:<\/h[2-5]>|<\/strong>|<\/b>)[\s\S]*?(?:Sheriff|Coroner)[\s:]*\s*([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+){1,3})/gi;
    let e;
    while ((e = entryRegex.exec(html)) !== null) {
      const county = e[1].trim() + ' County';
      const name = e[2].trim();
      addSheriff(items, seen, county, name);
    }
  }

  // Strategy 4: Look for links or divs containing county + sheriff pairs
  if (items.length === 0) {
    const pairRegex = /(\w[\w\s]+?)\s*County[\s\S]*?(?:Sheriff|Coroner)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+){1,3})/gi;
    let p;
    while ((p = pairRegex.exec(html)) !== null) {
      const county = p[1].trim() + ' County';
      const name = p[2].trim();
      addSheriff(items, seen, county, name);
    }
  }

  console.log(`CA sheriffs parsed: ${items.length}`);
  return items;
}

function addSheriff(items, seen, countyRaw, nameRaw) {
  // Clean the name — remove "Sheriff" prefix if present
  let name = nameRaw.replace(/^(?:Sheriff|Coroner|Sheriff[-\/]Coroner)\s+/i, '').trim();
  name = cleanName(name);
  if (!name) return;

  // Normalize county
  let county = countyRaw.trim();
  if (!/county/i.test(county)) county = county + ' County';

  const key = county.toLowerCase() + ':' + name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);

  const loc = normalizeLocality(county);
  items.push({
    id: makeId('CA', 'sheriff', (loc.locality || '').toLowerCase(), name.toLowerCase()),
    data: {
      category: 'sheriff',
      state: 'CA',
      locality: loc.locality,
      localityLower: loc.localityLower,
      office: 'Sheriff',
      name,
      nameTokens: nameTokens(name),
      party: null,
      tookOffice: null,
      termEnds: null,
      contact: {},
      photo: null,
      sourceUrl: SOURCE_URL,
      castsVotes: false,
      voteRecordsUrl: null,
    },
  });
}

module.exports = { scrape };
