/**
 * NY sheriffs scraper — NY Sheriffs Association directory at nysheriffs.org/sheriffs
 * lists all 62 county sheriffs. Page typically has sheriff name + county in a list/table.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');

const SOURCE_URL = 'https://www.nysheriffs.org/sheriffs';

async function scrape() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'politicker-scraper/1.0' } });
  if (!res.ok) throw new Error(`nysheriffs.org returned ${res.status}`);
  const html = await res.text();

  const items = [];
  const seen = new Set();

  // Strategy 1: table rows — <td>County</td><td>Sheriff Name</td>
  const cells = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    cells.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  if (cells.length >= 2) {
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const county = cells[i].trim();
      const name = cells[i + 1].trim();
      if (county && name) addSheriff(items, seen, county, name);
    }
  }

  // Strategy 2: heading/list pattern — "County: Sheriff Name" or structured divs
  if (items.length === 0) {
    // Try pattern: <h3>County Name</h3> ... Sheriff Name ...
    const blockRegex = /<(?:h[2-5]|strong|b)[^>]*>([\s\S]*?)<\/(?:h[2-5]|strong|b)>([\s\S]*?)(?=<(?:h[2-5]|strong|b)[^>]|$)/gi;
    let b;
    while ((b = blockRegex.exec(html)) !== null) {
      const heading = b[1].replace(/<[^>]+>/g, '').trim();
      const body = b[2].replace(/<[^>]+>/g, '').trim();
      // heading = county name, body contains sheriff name
      if (/county/i.test(heading) && body.length > 2) {
        const nameLine = body.split(/[\n\r,;]+/)[0].trim();
        if (nameLine) addSheriff(items, seen, heading, nameLine);
      }
    }
  }

  // Strategy 3: "County – Name" or "County - Name" on a single line
  if (items.length === 0) {
    const lineRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+County)\s*[-–—:]\s*(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/g;
    let l;
    while ((l = lineRegex.exec(html)) !== null) {
      addSheriff(items, seen, l[1], l[2]);
    }
  }

  console.log(`NY sheriffs parsed: ${items.length}`);
  return items;
}

function addSheriff(items, seen, countyRaw, nameRaw) {
  // Clean up the sheriff title prefix if present
  const name = nameRaw.replace(/^Sheriff\s+/i, '').trim();
  const cleaned = cleanName(name);
  if (!cleaned) return;

  // Normalize county — ensure it ends with "County"
  let county = countyRaw.replace(/\s+county$/i, '').trim();
  county = `${county} County`;

  const key = `${county.toLowerCase()}-${cleaned.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);

  const loc = normalizeLocality(county);
  items.push({
    id: makeId('NY', 'sheriff', (loc.locality || '').toLowerCase(), cleaned.toLowerCase()),
    data: {
      category: 'sheriff',
      state: 'NY',
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
      seniorityNumber: null,
    },
  });
}

module.exports = { scrape };
