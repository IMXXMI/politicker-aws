/**
 * FL sheriffs scraper — Florida Sheriffs Association directory lists all 67 county sheriffs.
 * Source: https://www.flsheriffs.org/sheriffs-offices
 * Page renders sheriff cards with name + county.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');

const SOURCE_URL = 'https://www.flsheriffs.org/sheriffs-offices';

async function scrape() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'politicker-scraper/1.0' } });
  if (!res.ok) throw new Error(`flsheriffs.org returned ${res.status}`);
  const html = await res.text();

  const items = [];
  const seen = new Set();

  // Strategy 1: Look for structured card/list blocks with sheriff name + county
  // The FSA page typically lists entries as "<County> County — Sheriff <Name>" or similar
  // Try table rows first
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const cells = [];
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    cells.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  if (cells.length >= 2) {
    // Try pairing cells as [county, sheriff name] or [sheriff name, county]
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const a = cells[i];
      const b = cells[i + 1];
      let county = null;
      let name = null;

      if (/county/i.test(a)) {
        county = a;
        name = b;
      } else if (/county/i.test(b)) {
        county = b;
        name = a;
      } else {
        continue;
      }

      name = name.replace(/^Sheriff\s+/i, '').trim();
      if (!name || !county) continue;

      const cleaned = cleanName(name);
      if (!cleaned) continue;
      const loc = normalizeLocality(county);
      const key = (loc.localityLower || '') + '-' + cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        id: makeId('FL', 'sheriff', (loc.locality || '').toLowerCase(), cleaned.toLowerCase()),
        data: {
          category: 'sheriff',
          state: 'FL',
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
  }

  // Strategy 2: If table parsing found nothing, try regex patterns on the full page
  if (items.length === 0) {
    // Pattern: "Sheriff <Name>" near "<County> County"
    const sheriffPattern = /(?:Sheriff\s+)([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/g;
    const countyPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+County/g;

    // Collect all sheriff names and counties from the page
    const sheriffNames = [];
    const counties = [];
    let sm;
    while ((sm = sheriffPattern.exec(html.replace(/<[^>]+>/g, ' '))) !== null) {
      sheriffNames.push({ name: sm[1].trim(), idx: sm.index });
    }
    while ((sm = countyPattern.exec(html.replace(/<[^>]+>/g, ' '))) !== null) {
      counties.push({ county: sm[1].trim() + ' County', idx: sm.index });
    }

    // Match each sheriff to closest county mention
    for (const s of sheriffNames) {
      let closest = null;
      let minDist = Infinity;
      for (const c of counties) {
        const dist = Math.abs(s.idx - c.idx);
        if (dist < minDist) {
          minDist = dist;
          closest = c;
        }
      }
      if (!closest || minDist > 500) continue;

      const cleaned = cleanName(s.name);
      if (!cleaned) continue;
      const loc = normalizeLocality(closest.county);
      const key = (loc.localityLower || '') + '-' + cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        id: makeId('FL', 'sheriff', (loc.locality || '').toLowerCase(), cleaned.toLowerCase()),
        data: {
          category: 'sheriff',
          state: 'FL',
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
  }

  // Strategy 3: Look for links/cards with href containing sheriff info
  if (items.length === 0) {
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm;
    while ((lm = linkRegex.exec(html)) !== null) {
      const text = lm[2].replace(/<[^>]+>/g, '').trim();
      // Match patterns like "Baker County - Sheriff Scotty Rhoden"
      const combined = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+County\s*[-–—]\s*Sheriff\s+(.+)$/i);
      if (combined) {
        const county = combined[1].trim() + ' County';
        const name = combined[2].trim();
        const cleaned = cleanName(name);
        if (!cleaned) continue;
        const loc = normalizeLocality(county);
        const key = (loc.localityLower || '') + '-' + cleaned.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          id: makeId('FL', 'sheriff', (loc.locality || '').toLowerCase(), cleaned.toLowerCase()),
          data: {
            category: 'sheriff',
            state: 'FL',
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
    }
  }

  console.log(`FL sheriffs parsed: ${items.length}`);
  return items;
}

module.exports = { scrape };
