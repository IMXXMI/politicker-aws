/**
 * PA sheriffs scraper — Pennsylvania Sheriffs' Association directory at pasheriffs.org.
 * The directory page lists all 67 county sheriffs with their jurisdiction and name.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');

const SOURCE_URL = 'https://pasheriffs.org/sheriffs/';

async function scrape() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'politicker-scraper/1.0' } });
  if (!res.ok) throw new Error(`pasheriffs.org returned ${res.status}`);
  const html = await res.text();

  const items = [];

  // Strategy 1: Table-based layout — look for <td> cells grouped into rows
  const cells = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    cells.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  if (cells.length >= 2) {
    // Try to detect column layout — look for patterns of county + name pairs
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const col1 = cells[i];
      const col2 = cells[i + 1];

      // Determine which column is county and which is name
      let locality, sheriffName;
      if (/county/i.test(col1)) {
        locality = col1;
        sheriffName = col2;
      } else if (/county/i.test(col2)) {
        locality = col2;
        sheriffName = col1;
      } else {
        continue;
      }

      // Strip "Sheriff" prefix if present
      sheriffName = sheriffName.replace(/^Sheriff\s+/i, '').trim();
      if (!sheriffName || !locality) continue;

      const cleaned = cleanName(sheriffName);
      if (!cleaned) continue;
      const loc = normalizeLocality(locality);
      if (!loc.locality) continue;

      items.push({
        id: makeId('PA', 'sheriff', (loc.locality || '').toLowerCase(), cleaned.toLowerCase()),
        data: {
          category: 'sheriff',
          state: 'PA',
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

  // Strategy 2: If table parsing found nothing, try heading/list-based extraction
  if (items.length === 0) {
    // Look for patterns like "County Name\nSheriff Name" or structured blocks
    const blockRegex = /<(?:div|li|article|section)[^>]*>([\s\S]*?)<\/(?:div|li|article|section)>/gi;
    const seen = new Set();
    let block;
    while ((block = blockRegex.exec(html)) !== null) {
      const text = block[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const countyMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+County)/);
      if (!countyMatch) continue;

      const locality = countyMatch[1];
      // Try to find a name near the county reference
      const nameMatch = text.match(/(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})/);
      if (!nameMatch || nameMatch[1] === locality) continue;

      const sheriffName = nameMatch[1].replace(/^Sheriff\s+/i, '').trim();
      const cleaned = cleanName(sheriffName);
      if (!cleaned) continue;
      const loc = normalizeLocality(locality);
      if (!loc.locality) continue;

      const key = `${loc.localityLower}-${cleaned.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        id: makeId('PA', 'sheriff', (loc.locality || '').toLowerCase(), cleaned.toLowerCase()),
        data: {
          category: 'sheriff',
          state: 'PA',
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

  console.log(`PA sheriffs parsed: ${items.length}`);
  return items;
}

module.exports = { scrape };
