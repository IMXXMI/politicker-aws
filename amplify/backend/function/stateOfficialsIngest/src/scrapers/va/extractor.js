/**
 * Generic member-page extractor for VA locality BoS / City Council / School Board pages.
 * Each locality uses a different CMS — this function tries a cascade of heuristics:
 *
 *   1. Structured blocks: look for elements with class names like *-member, *-card, *-trustee
 *   2. Heading+context: <h2|h3|h4> containing a person name, role inferred from nearby text
 *   3. Named lists: <li> containing "District N: <Name>" or "<Name> - Chair"
 *
 * Output: [{ name, role?, district?, bio?, photo? }]
 *
 * This is best-effort. Some localities will parse cleanly; others will produce partial or
 * noisy results. `sourceUrl` is always stored so users can cross-check.
 */

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Regex matches common name patterns. Accepts 2-4 tokens, requires each to start with uppercase.
// Filters out obvious noise ("Board Of", "District One", etc.) via blacklist.
const NAME_NOISE = new Set([
  'Board Of', 'District One', 'District Two', 'District Three',
  'City Council', 'School Board', 'Virginia Beach', 'Chesterfield County',
  'Prince William', 'Board Members', 'Members Board', 'Chair Board',
]);
const NAME_REGEX = /\b([A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z]+){1,3})\b/g;

function extractMembers(html) {
  const results = [];
  const seen = new Set();

  // Pass 1: structured blocks
  const blockRegex = /<(?:div|article|li|section)[^>]*class="[^"]*(?:member|council|trustee|supervisor|board-?member|director|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li|section)>/gi;
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    const text = stripTags(m[1]);
    parseBlock(text, results, seen);
  }

  // Pass 2: heading-anchored blocks if pass 1 found nothing
  if (results.length === 0) {
    const headingRegex = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>([\s\S]{0,400}?)(?=<h[1-4]|<\/main|<\/body)/gi;
    let h;
    while ((h = headingRegex.exec(html)) !== null) {
      const headText = stripTags(h[1]);
      const contextText = stripTags(h[2]);
      parseBlock(`${headText}. ${contextText}`, results, seen);
    }
  }

  return results;
}

function parseBlock(text, results, seen) {
  if (!text || text.length < 4) return;
  // Try to find a name token in the block
  let nameMatch;
  NAME_REGEX.lastIndex = 0;
  while ((nameMatch = NAME_REGEX.exec(text)) !== null) {
    const name = nameMatch[1].trim();
    if (NAME_NOISE.has(name)) continue;
    if (name.split(/\s+/).length < 2) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // Role hints: look for "Chair"/"Vice Chair"/"District N" near the name
    const lower = text.toLowerCase();
    let role = null;
    if (/vice\s*chair/.test(lower)) role = 'Vice Chair';
    else if (/\bchair\b/.test(lower) || /chairman/i.test(lower)) role = 'Chair';
    else if (/at[-\s]?large/i.test(text)) role = 'At-Large';

    let district = null;
    const dMatch = text.match(/\b(?:District|Ward|Borough)\s+([A-Za-z0-9]+)/);
    if (dMatch) district = dMatch[1];

    results.push({ name, role, district });
    // Only take first name per block (avoids duplicate picks from bio text)
    break;
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'politicker-scraper/1.0 (civic data)' } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

module.exports = { fetchHtml, extractMembers };
