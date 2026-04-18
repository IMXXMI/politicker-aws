/**
 * TX sheriffs scraper -- Texas Sheriffs' Association directory page lists
 * all 254 county sheriffs. Parses the directory for sheriff names + counties.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');

const SOURCE_URL = 'https://www.txsheriffs.org/texas-sheriffs-list';

async function scrape() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'politicker-scraper/1.0' } });
  if (!res.ok) throw new Error(`txsheriffs.org returned ${res.status}`);
  const html = await res.text();

  const items = [];
  const seen = new Set();

  // Strategy 1: table rows — many sheriff association pages use <tr><td>County</td><td>Name</td>...
  const cells = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    cells.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  if (cells.length >= 2) {
    // Try 2-column layout: County | Sheriff Name
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const county = cells[i];
      const rawName = cells[i + 1];
      if (!county || !rawName) continue;
      // Skip header rows
      if (/^county$/i.test(county) || /^sheriff$/i.test(rawName)) continue;
      addSheriff(items, seen, county, rawName);
    }

    // If 2-col didn't yield results, try 3-column: County | Sheriff | Phone/other
    if (items.length === 0 && cells.length >= 3) {
      for (let i = 0; i + 2 < cells.length; i += 3) {
        const county = cells[i];
        const rawName = cells[i + 1];
        if (!county || !rawName) continue;
        if (/^county$/i.test(county) || /^sheriff$/i.test(rawName)) continue;
        addSheriff(items, seen, county, rawName);
      }
    }

    // Also try 4-column layout: # | County | Sheriff | other
    if (items.length === 0 && cells.length >= 4) {
      for (let i = 0; i + 3 < cells.length; i += 4) {
        const county = cells[i + 1];
        const rawName = cells[i + 2];
        if (!county || !rawName) continue;
        if (/^county$/i.test(county) || /^sheriff$/i.test(rawName)) continue;
        addSheriff(items, seen, county, rawName);
      }
    }
  }

  // Strategy 2: list items — <li> containing "County - Sheriff Name" or similar
  if (items.length === 0) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let li;
    while ((li = liRegex.exec(html)) !== null) {
      const text = li[1].replace(/<[^>]+>/g, '').trim();
      // Pattern: "County Name - Sheriff Name" or "County Name: Sheriff Name"
      const parts = text.split(/\s*[-:]\s*/);
      if (parts.length >= 2) {
        const county = parts[0].trim();
        const rawName = parts[1].replace(/^Sheriff\s+/i, '').trim();
        if (county && rawName && /county$/i.test(county)) {
          addSheriff(items, seen, county, rawName);
        }
      }
    }
  }

  // Strategy 3: heading blocks — <h3>County</h3> followed by Sheriff Name
  if (items.length === 0) {
    const headingRegex = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>([\s\S]*?)(?=<h[2-4]|$)/gi;
    let h;
    while ((h = headingRegex.exec(html)) !== null) {
      const county = h[1].replace(/<[^>]+>/g, '').trim();
      const body = h[2].replace(/<[^>]+>/g, '').trim();
      if (/county$/i.test(county) && body) {
        // Extract first line or name-like string from body
        const nameLine = body.split(/[\n\r]/)[0].replace(/^Sheriff\s+/i, '').trim();
        addSheriff(items, seen, county, nameLine);
      }
    }
  }

  console.log(`TX sheriffs parsed: ${items.length}`);
  return items;
}

function addSheriff(items, seen, countyRaw, rawName) {
  // Strip "Sheriff" prefix if present
  const nameStr = rawName.replace(/^Sheriff\s+/i, '').trim();
  const cleaned = cleanName(nameStr);
  if (!cleaned) return;

  // Ensure county suffix
  let county = countyRaw.trim();
  if (!/county$/i.test(county)) county = `${county} County`;
  const loc = normalizeLocality(county);
  if (!loc.locality) return;

  const key = `${(loc.locality || '').toLowerCase()}-${cleaned.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);

  items.push({
    id: makeId('TX', 'sheriff', (loc.locality || '').toLowerCase(), cleaned.toLowerCase()),
    data: {
      category: 'sheriff',
      state: 'TX',
      locality: loc.locality,
      localityLower: loc.localityLower,
      office: 'Sheriff',
      name: cleaned,
      nameTokens: nameTokens(cleaned),
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
