/**
 * All-states scraper engine. Iterates every state in stateConfigs.js and tries
 * each configured source with multiple extraction strategies. Best-effort — states
 * that fail get logged and skipped.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');
const stateConfigs = require('./stateConfigs');

const HEADERS = { 'User-Agent': 'politicker-scraper/1.0 (civic data; admin@politickerapp.com)' };

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// --- Extraction strategies (same as national/sheriffs.js but generalized) ---

function extractTable(html) {
  const out = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const cells = [];
  let m;
  while ((m = cellRegex.exec(html)) !== null) cells.push(stripTags(m[1]));
  // 4-col: rank, county, name, date
  for (let i = 0; i + 3 < cells.length; i += 4) {
    if (/^\d+$/.test(cells[i]) && cells[i + 2].length > 3) {
      out.push({ name: cells[i + 2].replace(/^(Sheriff|Judge|Hon\.?|Commissioner|Supervisor|Chair|Member|Dr\.?)\s+/i, '').trim(), locality: cells[i + 1].trim() });
    }
  }
  if (out.length > 3) return out;
  // 3-col
  for (let i = 0; i + 2 < cells.length; i += 3) {
    if (cells[i].length > 2 && cells[i].length < 60 && cells[i + 1].length > 3 && cells[i + 1].length < 60) {
      out.push({ name: cells[i + 1].replace(/^(Sheriff|Judge|Hon\.?)\s+/i, '').trim(), locality: cells[i].trim() });
    }
  }
  if (out.length > 3) return out;
  // 2-col
  for (let i = 0; i + 1 < cells.length; i += 2) {
    if (cells[i].length > 2 && cells[i].length < 60 && cells[i + 1].length > 3 && cells[i + 1].length < 60) {
      out.push({ name: cells[i + 1].replace(/^(Sheriff|Judge|Hon\.?)\s+/i, '').trim(), locality: cells[i].trim() });
    }
  }
  return out;
}

function extractLinks(html) {
  const out = [];
  const seen = new Set();
  const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text.length < 6 || text.length > 120) continue;
    // "County — Name" or "Name — County"
    const pat1 = text.match(/^([A-Za-z\s.]+(?:County|Parish|Borough))\s*[-–—:,]\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})/);
    if (pat1 && !seen.has(pat1[2].toLowerCase())) { seen.add(pat1[2].toLowerCase()); out.push({ name: pat1[2].trim(), locality: pat1[1].trim() }); continue; }
    const pat2 = text.match(/([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})\s*[-–—:,]\s*([A-Za-z\s.]+(?:County|Parish|Borough))/);
    if (pat2 && !seen.has(pat2[1].toLowerCase())) { seen.add(pat2[1].toLowerCase()); out.push({ name: pat2[1].trim(), locality: pat2[2].trim() }); }
  }
  return out;
}

function extractBlocks(html) {
  const out = [];
  const blockRegex = /<(?:div|li|article|section)[^>]*class="[^"]*(?:member|sheriff|county|card|directory|official|person|staff|profile|elected)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|article|section)>/gi;
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    const text = stripTags(m[1]);
    if (text.length < 6 || text.length > 500) continue;
    const countyMatch = text.match(/([A-Za-z\s.]+(?:County|Parish|Borough|City))/);
    const nameRegex = /([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/g;
    let nm;
    while ((nm = nameRegex.exec(text)) !== null) {
      const name = nm[1].trim();
      if (name.split(/\s+/).length < 2) continue;
      if (/^(Board Of|County Of|City Of|District|State|United|New York|North|South|West|East)$/i.test(name)) continue;
      out.push({ name, locality: countyMatch ? countyMatch[1].trim() : null });
      break; // one name per block
    }
  }
  return out;
}

function extractText(html) {
  const text = stripTags(html);
  const out = [];
  const seen = new Set();
  const addResult = (name, locality) => {
    if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push({ name, locality }); }
  };
  // "County Sheriff's Office - Name, Sheriff" (ND POST Board format)
  const re0 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+County\s+Sheriff'?s?\s+Office\s*[-–—]\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3}),?\s*Sheriff/gi;
  let m;
  while ((m = re0.exec(text)) !== null) addResult(m[2].trim(), m[1].trim() + ' County');
  // "Sheriff Name — County"
  const re1 = /(?:Sheriff|Judge|Commissioner|Supervisor)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})[\s,–—-]+([A-Za-z\s.]+(?:County|Parish|Borough))/gi;
  while ((m = re1.exec(text)) !== null) addResult(m[1].trim(), m[2].trim());
  // "County — Sheriff Name"
  const re2 = /([A-Za-z\s.]+(?:County|Parish|Borough))[\s,–—-]+(?:Sheriff|Judge)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})/gi;
  while ((m = re2.exec(text)) !== null) addResult(m[2].trim(), m[1].trim());
  // "County: Sheriff Name" (KACo-style)
  const re3 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+County\s*[→:]\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})/gi;
  while ((m = re3.exec(text)) !== null) addResult(m[2].trim(), m[1].trim() + ' County');
  return out;
}

function extractHeadings(html) {
  // Pattern: <h2|h3|h4>County Name</h2> followed by text containing a person name
  const out = [];
  const seen = new Set();
  const hRegex = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>([\s\S]{0,600}?)(?=<h[2-4]|$)/gi;
  let m;
  while ((m = hRegex.exec(html)) !== null) {
    const heading = stripTags(m[1]).trim();
    const body = stripTags(m[2]).trim();
    // heading should look like a county/parish/jurisdiction name
    if (!/county|parish|borough|city/i.test(heading) && heading.length > 40) continue;
    const locality = heading.replace(/\s*county\s*$/i, ' County').replace(/\s*parish\s*$/i, ' Parish').trim();
    // body should contain a person name
    const nameMatch = body.match(/(?:Sheriff|Judge|Commissioner|Chair|Supervisor|Chief|Hon\.?)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      if (!seen.has(name.toLowerCase()) && name.split(/\s+/).length >= 2) {
        seen.add(name.toLowerCase());
        out.push({ name, locality });
      }
      continue;
    }
    // Fallback: first 2-3 word capitalized name in the body
    const fallback = body.match(/([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (fallback && !seen.has(fallback[1].toLowerCase()) && fallback[1].split(/\s+/).length >= 2) {
      // Skip noise: long strings, known non-names
      if (fallback[1].length < 40 && !/Board|County|State|Office|Department|District|Phone|Email|Address/i.test(fallback[1])) {
        seen.add(fallback[1].toLowerCase());
        out.push({ name: fallback[1].trim(), locality });
      }
    }
  }
  return out;
}

// Broader: just find all co-occurrences of county-like words + person names anywhere on page
function extractBroadSweep(html) {
  const text = stripTags(html);
  const out = [];
  const seen = new Set();
  // Split by county/parish mentions, look for nearby names
  const chunks = text.split(/(?=[A-Z][a-z]+ (?:County|Parish|Borough))/g);
  for (const chunk of chunks) {
    const countyMatch = chunk.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:County|Parish|Borough))/);
    if (!countyMatch) continue;
    const locality = countyMatch[1];
    const rest = chunk.slice(locality.length);
    const nameMatch = rest.match(/(?:Sheriff|Judge|Commissioner)?\s*([A-Z][a-z]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]+)/);
    if (nameMatch && !seen.has(nameMatch[1].toLowerCase())) {
      const name = nameMatch[1].trim();
      if (name.split(/\s+/).length >= 2 && name.length < 40 && !/County|Parish|Borough|Phone|Email|Office/i.test(name)) {
        seen.add(name.toLowerCase());
        out.push({ name, locality });
      }
    }
  }
  return out;
}

// Extract names from bold/strong tags paired with nearby county references
function extractBoldNames(html) {
  const out = [];
  const seen = new Set();
  // Find all <strong> or <b> content that looks like a person name
  const boldRegex = /<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi;
  let m;
  while ((m = boldRegex.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text.length < 4 || text.length > 60) continue;
    // Must look like a name (2+ words, starts with uppercase)
    const nameMatch = text.match(/^(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})$/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (name.split(/\s+/).length < 2) continue;
    if (/^(Board Of|County Of|Click Here|Read More|Learn More|Contact Us|Phone|Email)$/i.test(name)) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    // Try to find a county in the surrounding 500 chars
    const pos = m.index;
    const context = stripTags(html.slice(Math.max(0, pos - 300), Math.min(html.length, pos + 500)));
    const countyMatch = context.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:County|Parish|Borough))/);
    out.push({ name, locality: countyMatch ? countyMatch[1] : null });
  }
  return out;
}

// Pure name extraction — finds "Sheriff FirstName LastName" anywhere on page, no county required
function extractSheriffNames(html) {
  const text = stripTags(html);
  const out = [];
  const seen = new Set();
  // Pattern: "Name, Sheriff" (like ND POST Board)
  const reverseRe = /([A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z]+){1,3}),?\s+Sheriff/g;
  let rm;
  while ((rm = reverseRe.exec(text)) !== null) {
    const name = rm[1].trim();
    if (name.split(/\s+/).length >= 2 && !seen.has(name.toLowerCase()) && !/Office|Department|County|Association/i.test(name)) {
      seen.add(name.toLowerCase());
      const ctx = text.slice(Math.max(0, rm.index - 200), rm.index + 200);
      const county = ctx.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:County|Parish|Borough))/);
      out.push({ name, locality: county ? county[1] : null });
    }
  }
  // Pattern: "Sheriff Name" (standard)
  const re = /Sheriff\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    if (name.split(/\s+/).length < 2) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    // Try county from nearby context
    const ctx = text.slice(Math.max(0, m.index - 200), m.index + 200);
    const county = ctx.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:County|Parish|Borough))/);
    out.push({ name, locality: county ? county[1] : null });
  }
  return out;
}

// WordPress/CMS post titles — many directories list sheriffs as WordPress posts with title = "County Name" and content = sheriff info
function extractPostTitles(html) {
  const out = [];
  const seen = new Set();
  const postRegex = /<(?:h[2-4]|a)[^>]*class="[^"]*(?:entry-title|post-title|wp-block-heading|card-title)[^"]*"[^>]*>([\s\S]*?)<\/(?:h[2-4]|a)>([\s\S]{0,800}?)(?=<(?:h[2-4]|a)[^>]*class="[^"]*(?:entry-title|post-title|wp-block-heading|card-title)|$)/gi;
  let m;
  while ((m = postRegex.exec(html)) !== null) {
    const title = stripTags(m[1]).trim();
    const body = stripTags(m[2]).trim();
    // Title might be county name or sheriff name
    const combined = `${title} ${body}`;
    const nameMatch = combined.match(/(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})/);
    const countyMatch = combined.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:County|Parish|Borough))/);
    if (nameMatch && nameMatch[1].split(/\s+/).length >= 2) {
      const name = nameMatch[1].trim();
      if (!seen.has(name.toLowerCase()) && !/^(Board Of|County Of|Click|Read|Learn)/.test(name)) {
        seen.add(name.toLowerCase());
        out.push({ name, locality: countyMatch ? countyMatch[1] : null });
      }
    }
  }
  return out;
}

const STRATEGY_MAP = { table: extractTable, links: extractLinks, blocks: extractBlocks, text: extractText, headings: extractHeadings, bold: extractBoldNames, sheriffNames: extractSheriffNames, posts: extractPostTitles, broad: extractBroadSweep };

async function fetchAndExtract(url, strategies) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status}`);
  const body = await res.text();

  // If the response is JSON (some sites serve API endpoints), try to extract from JSON first
  if (body.trim().startsWith('[') || body.trim().startsWith('{')) {
    try {
      const data = JSON.parse(body);
      const arr = Array.isArray(data) ? data : (data.results || data.data || data.sheriffs || data.members || data.directory || []);
      if (Array.isArray(arr) && arr.length > 0) {
        const jsonResults = [];
        for (const item of arr) {
          // Try common JSON field names
          const name = item.name || item.sheriffName || item.sheriff_name || item.fullName || item.full_name ||
            [item.firstName || item.first_name, item.lastName || item.last_name].filter(Boolean).join(' ') ||
            [item.first, item.last].filter(Boolean).join(' ') || '';
          const locality = item.county || item.countyName || item.county_name || item.jurisdiction || item.locality || '';
          if (name && name.length > 3) {
            jsonResults.push({ name: name.replace(/^Sheriff\s+/i, '').trim(), locality: locality || null });
          }
        }
        if (jsonResults.length > 0) return jsonResults;
      }
    } catch (e) { /* not valid JSON, fall through to HTML strategies */ }
  }

  const html = body;
  for (const strat of strategies) {
    if (strat === 'skip') return [];
    const fn = STRATEGY_MAP[strat];
    if (!fn) continue;
    const results = fn(html);
    if (results.length >= 1) return results;
  }
  return [];
}

// USACOPS.com deep crawler — fetches the list page, extracts county profile links,
// then fetches each profile page to get the actual sheriff name.
// Reliable for ALL states since USACOPS covers every US county.
async function fetchUsacopsDeep(stateCode) {
  const listUrl = `https://www.usacops.com/${stateCode.toLowerCase()}/shrflist.html`;
  try {
    const res = await fetch(listUrl, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();

    // Extract all county profile links: href="s{zip}/index.html" with county name
    const linkRegex = /<a[^>]*href="(s\d+\/index\.html)"[^>]*>([^<]+)<\/a>/gi;
    const countyLinks = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const path = m[1];
      const county = stripTags(m[2]).replace(/\*$/, '').trim();
      if (county && path) {
        countyLinks.push({ path, county: county.replace(/\s*Co$/, ' County').replace(/\s*Parish$/, ' Parish') });
      }
    }

    if (countyLinks.length === 0) return [];
    console.log(`    USACOPS ${stateCode}: found ${countyLinks.length} county links, fetching profiles...`);

    // Fetch profile pages in batches of 10 to avoid overwhelming the server
    const results = [];
    const BATCH = 10;
    for (let i = 0; i < countyLinks.length; i += BATCH) {
      const batch = countyLinks.slice(i, i + BATCH);
      const profileResults = await Promise.all(batch.map(async ({ path, county }) => {
        try {
          const profileUrl = `https://www.usacops.com/${stateCode.toLowerCase()}/${path}`;
          const pr = await fetch(profileUrl, { headers: HEADERS });
          if (!pr.ok) return null;
          const profileHtml = await pr.text();
          // Strategy 1: check <title> tag — often "Sheriff FirstName LastName - County"
          const titleMatch = profileHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch) {
            const titleName = titleMatch[1].match(/(?:Sheriff\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/);
            if (titleName && titleName[1].split(/\s+/).length >= 2 && !/Office|Department|County|Phone|Email|Sheriff's/i.test(titleName[1])) {
              return { name: titleName[1].trim(), locality: county };
            }
          }
          // Strategy 2: body text — "Sheriff\s+Name" or "Sheriff:\s+Name" or "Sheriff -\s+Name"
          const profileText = stripTags(profileHtml);
          const patterns = [
            /Sheriff\s*[:\-–]?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/,
            /(?:Chief Deputy|Undersheriff|Sheriff)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,3})/,
          ];
          for (const pat of patterns) {
            const m = profileText.match(pat);
            if (m) {
              const name = m[1].trim();
              if (name.split(/\s+/).length >= 2 && !/Office|Department|County|Phone|Email|Address|Association|State|United/i.test(name)) {
                return { name, locality: county };
              }
            }
          }
          // Strategy 3: first bold/strong name on page
          const boldMatch = profileHtml.match(/<(?:strong|b|h[1-3])[^>]*>\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})\s*<\/(?:strong|b|h[1-3])>/);
          if (boldMatch) {
            const name = boldMatch[1].trim();
            if (name.split(/\s+/).length >= 2 && name.length < 40 && !/Office|Department|County|Sheriff's|Phone|State/i.test(name)) {
              return { name, locality: county };
            }
          }
          return null;
        } catch { return null; }
      }));
      results.push(...profileResults.filter(Boolean));
    }

    console.log(`    USACOPS ${stateCode}: extracted ${results.length} sheriffs from ${countyLinks.length} profiles`);
    return results;
  } catch (e) {
    console.warn(`    USACOPS deep ${stateCode}: ${e.message}`);
    return [];
  }
}

async function scrape() {
  const allItems = [];
  const stats = { states: 0, fetched: 0, parsed: 0, failed: 0, usacopsFallback: 0, total: 0 };
  const categories = ['sheriffs', 'judges', 'countyBoard', 'schoolBoard'];
  const categoryToFirestore = { sheriffs: 'sheriff', judges: 'state-judge', countyBoard: 'county-board', schoolBoard: 'school-board' };
  const officeLabels = { sheriffs: 'Sheriff', judges: 'Judge', countyBoard: 'County Official', schoolBoard: 'School Board Member' };

  for (const [stateCode, config] of Object.entries(stateConfigs)) {
    let stateHits = 0;
    for (const cat of categories) {
      const catConfig = config[cat];
      // For sheriffs: even if primary URL is null/skip, try USACOPS fallback
      if (!catConfig || catConfig.strategies[0] === 'skip') {
        if (cat === 'sheriffs') {
          const usacopsResults = await fetchUsacopsDeep(stateCode);
          if (usacopsResults.length > 0) {
            stats.usacopsFallback++;
            const firestoreCat = categoryToFirestore[cat];
            const seen = new Set();
            for (const r of usacopsResults) {
              const cleaned = cleanName(r.name);
              if (!cleaned) continue;
              const key = `${stateCode}|${cleaned}`.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              const { locality, localityLower } = normalizeLocality(r.locality);
              allItems.push({
                id: makeId(stateCode, firestoreCat, (locality || '').toLowerCase(), cleaned.toLowerCase()),
                data: {
                  category: firestoreCat, state: stateCode, locality, localityLower,
                  office: officeLabels[cat], name: cleaned, nameTokens: nameTokens(cleaned),
                  party: null, tookOffice: null, termEnds: null, contact: {},
                  photo: null, sourceUrl: `https://www.usacops.com/${stateCode.toLowerCase()}/shrflist.html`,
                  castsVotes: false, voteRecordsUrl: null,
                },
              });
            }
            console.log(`  [${cat}] ${stateCode}: ${usacopsResults.length} officials (USACOPS, no primary source)`);
            stats.total += usacopsResults.length;
            if (usacopsResults.length > 0) stats.states++;
          }
        }
        continue;
      }
      if (!catConfig.url) continue;
      try {
        stats.fetched++;
        let results = await fetchAndExtract(catConfig.url, catConfig.strategies);
        if (results.length === 0) {
          // Fallback: try USACOPS.com for sheriffs (works for all states, simple HTML)
          if (cat === 'sheriffs') {
            const usacopsResults = await fetchUsacopsDeep(stateCode);
            if (usacopsResults.length > 0) {
              stats.usacopsFallback++;
              results = usacopsResults;
              console.log(`  [${cat}] ${stateCode}: ${results.length} officials (via USACOPS fallback)`);
            }
          }
          if (results.length === 0) {
            console.warn(`  [${cat}] ${stateCode}: 0 results from primary + fallback`);
            continue;
          }
        }
        stats.parsed++;
        const seen = new Set();
        const firestoreCat = categoryToFirestore[cat];
        for (const r of results) {
          const cleaned = cleanName(r.name);
          if (!cleaned) continue;
          const key = `${stateCode}|${cleaned}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const { locality, localityLower } = normalizeLocality(r.locality);
          allItems.push({
            id: makeId(stateCode, firestoreCat, (locality || '').toLowerCase(), cleaned.toLowerCase()),
            data: {
              category: firestoreCat,
              state: stateCode,
              locality,
              localityLower,
              office: officeLabels[cat],
              name: cleaned,
              nameTokens: nameTokens(cleaned),
              party: null,
              tookOffice: null,
              termEnds: null,
              contact: {},
              photo: null,
              sourceUrl: catConfig.url,
              castsVotes: cat !== 'sheriffs',
              voteRecordsUrl: null,
            },
          });
          stateHits++;
        }
        console.log(`  [${cat}] ${stateCode}: ${results.length} officials`);
      } catch (e) {
        stats.failed++;
        console.warn(`  [${cat}] ${stateCode}: ${e.message}`);
      }
    }
    if (stateHits > 0) stats.states++;
    stats.total += stateHits;
  }

  console.log(`All-states engine: ${stats.states} states with data, ${stats.fetched} URLs fetched, ${stats.parsed} parsed, ${stats.failed} failed, ${stats.total} officials`);
  return allItems;
}

module.exports = { scrape };
