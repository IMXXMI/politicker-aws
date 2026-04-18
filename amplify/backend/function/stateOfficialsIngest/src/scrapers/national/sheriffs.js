/**
 * National sheriffs scraper — iterates every state's sheriff association directory
 * from the registry and extracts member lists. Handles the most common page formats:
 *   - HTML tables (like VA's seniority list)
 *   - List items with "Sheriff Name — County" patterns
 *   - Card/block layouts with class names containing "member", "sheriff", "county"
 *
 * States with no URL in the registry are skipped. States that 404 or parse-fail are logged.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');
const registry = require('./registry');

const HEADERS = { 'User-Agent': 'politicker-scraper/1.0 (civic data; admin@politickerapp.com)' };

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// Strategy 1: HTML table rows — look for rows with a county name + "Sheriff" + person name
function parseTable(html, stateCode) {
  const out = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const cells = [];
  let m;
  while ((m = cellRegex.exec(html)) !== null) cells.push(stripTags(m[1]));

  // Try 4-column (rank, county, sheriff name, date) like VA
  for (let i = 0; i + 3 < cells.length; i += 4) {
    if (/^\d+$/.test(cells[i]) && /sheriff/i.test(cells[i + 2])) {
      const name = cells[i + 2].replace(/^Sheriff\s+/i, '').trim();
      const locality = cells[i + 1].trim();
      if (name && locality) out.push({ name, locality, startDate: cells[i + 3] || null });
    }
  }
  if (out.length > 3) return out;

  // Try 3-column (county, sheriff, contact/date)
  for (let i = 0; i + 2 < cells.length; i += 3) {
    const c0 = cells[i]; const c1 = cells[i + 1];
    if (/county|parish|borough/i.test(c0) && c1.length > 4 && c1.length < 60) {
      const name = c1.replace(/^Sheriff\s+/i, '').trim();
      if (name && /[A-Z]/.test(name)) out.push({ name, locality: c0.trim(), startDate: null });
    }
  }
  if (out.length > 3) return out;

  // Try 2-column (county, sheriff name)
  for (let i = 0; i + 1 < cells.length; i += 2) {
    const c0 = cells[i]; const c1 = cells[i + 1];
    if (c0.length > 3 && c0.length < 50 && c1.length > 4 && c1.length < 60) {
      const name = c1.replace(/^Sheriff\s+/i, '').trim();
      if (name && /[A-Z]/.test(name)) out.push({ name, locality: c0.trim(), startDate: null });
    }
  }
  return out;
}

// Strategy 2: "Sheriff FirstName LastName — County" text patterns in free-form HTML
function parseTextPatterns(html) {
  const text = stripTags(html);
  const out = [];
  // Pattern: "Sheriff <Name> — <County>" or "<County> County — Sheriff <Name>"
  const re = /Sheriff\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})[\s,–—-]+([A-Za-z\s]+(?:County|Parish|Borough))/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1].trim(), locality: m[2].trim(), startDate: null });
  }
  // Reverse: "<County> County — Sheriff <Name>"
  const re2 = /([A-Za-z\s]+(?:County|Parish|Borough))[\s,–—-]+Sheriff\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/gi;
  while ((m = re2.exec(text)) !== null) {
    out.push({ name: m[2].trim(), locality: m[1].trim(), startDate: null });
  }
  return out;
}

// Strategy 3: link-text extraction — many sites list each sheriff as an <a> with "County - Sheriff Name" or "Sheriff Name, County"
function parseLinks(html) {
  const out = [];
  const seen = new Set();
  // Match <a> tags containing text that has both a county-like word and a name-like word
  const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text.length < 8 || text.length > 120) continue;
    // "County Name — Sheriff FirstName LastName"
    const pat1 = text.match(/^([A-Za-z\s]+(?:County|Parish|Borough))\s*[-–—:,]\s*(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})/);
    if (pat1) {
      const key = pat1[2].toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push({ name: pat1[2].trim(), locality: pat1[1].trim(), startDate: null }); }
      continue;
    }
    // "Sheriff FirstName LastName — County"
    const pat2 = text.match(/(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})\s*[-–—:,]\s*([A-Za-z\s]+(?:County|Parish|Borough))/);
    if (pat2) {
      const key = pat2[1].toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push({ name: pat2[1].trim(), locality: pat2[2].trim(), startDate: null }); }
    }
  }
  return out;
}

// Strategy 4: list items / card blocks with member class names
function parseBlocks(html) {
  const out = [];
  const blockRegex = /<(?:li|div|article)[^>]*class="[^"]*(?:member|sheriff|county|card|directory)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|div|article)>/gi;
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    const text = stripTags(m[1]);
    // Look for: county label + person name
    const countyMatch = text.match(/([A-Za-z\s]+(?:County|Parish|Borough))/);
    const nameMatch = text.match(/(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/);
    if (countyMatch && nameMatch && countyMatch[1] !== nameMatch[1]) {
      out.push({ name: nameMatch[1].replace(/^Sheriff\s+/i, '').trim(), locality: countyMatch[1].trim(), startDate: null });
    }
  }
  return out;
}

async function scrape() {
  const allItems = [];
  const states = Object.entries(registry);
  let fetched = 0; let parsed = 0; let failed = 0;

  for (const [stateCode, config] of states) {
    if (!config.sheriffAssocUrl) continue;
    if (stateCode === 'VA') continue; // VA has its own dedicated scraper
    try {
      const res = await fetch(config.sheriffAssocUrl, { headers: HEADERS });
      if (!res.ok) {
        console.warn(`  [Sheriff] ${stateCode}: ${res.status} from ${config.sheriffAssocUrl}`);
        failed++;
        continue;
      }
      fetched++;
      const html = await res.text();

      // Try all strategies, take the one with the most results (min 3 to be credible)
      const results = [parseTable(html, stateCode), parseTextPatterns(html), parseLinks(html), parseBlocks(html)];
      const best = results.sort((a, b) => b.length - a.length)[0];

      if (best.length === 0) {
        console.warn(`  [Sheriff] ${stateCode}: page fetched but 0 sheriffs extracted`);
        continue;
      }

      parsed++;
      const seen = new Set();
      for (const r of best) {
        const cleaned = cleanName(r.name);
        if (!cleaned) continue;
        const key = `${stateCode}|${cleaned}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const { locality, localityLower } = normalizeLocality(r.locality);
        allItems.push({
          id: makeId(stateCode, 'sheriff', (locality || '').toLowerCase(), cleaned.toLowerCase()),
          data: {
            category: 'sheriff',
            state: stateCode,
            locality,
            localityLower,
            office: 'Sheriff',
            name: cleaned,
            nameTokens: nameTokens(cleaned),
            party: null,
            tookOffice: r.startDate,
            termEnds: null,
            contact: {},
            photo: null,
            sourceUrl: config.sheriffAssocUrl,
            castsVotes: false,
            voteRecordsUrl: null,
          },
        });
      }
      console.log(`  [Sheriff] ${stateCode}: ${best.length} sheriffs`);
    } catch (e) {
      console.warn(`  [Sheriff] ${stateCode}: ${e.message}`);
      failed++;
    }
  }

  console.log(`National sheriffs: fetched ${fetched}, parsed ${parsed}, failed ${failed}, total ${allItems.length}`);
  return allItems;
}

module.exports = { scrape };
