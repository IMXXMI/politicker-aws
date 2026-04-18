/**
 * Generic member-page extractor for locality BoS / City Council / School Board pages.
 * Each locality uses a different CMS — this function tries a cascade of heuristics:
 *
 *   1. Structured blocks: look for elements with class names like *-member, *-card, *-trustee
 *   2. Heading+context: <h2|h3|h4> containing a person name, role inferred from nearby text
 *
 * Output: [{ name, role?, district?, bio?, photo? }]
 *
 * This is best-effort. Some localities will parse cleanly; others will produce partial or
 * noisy results. `sourceUrl` is always stored so users can cross-check.
 */

const { cleanName } = require('../../common/firestore');

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
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

// Words that appear in navigation, UI elements, page headings — not person names.
// If ANY of these appear in a candidate name string, reject it.
const UI_NOISE = /\b(menu|toggle|close|find|search|click|streaming|meeting|highlight|skip|content|navigation|footer|header|sidebar|breadcrumb|cookie|privacy|copyright|subscribe|newsletter|download|upload|submit|login|sign in|register|contact|read more|learn more|view all|share|print|follow|category|archive|tag|comment|reply|previous|next|page \d|home|about|faq|help|support|back to|go to|interest|annual|report|agenda|minute|calendar|map|photo|video|news|event|press|release|update|alert|notice|schedule|budget|ordinance|resolution|election|vote|ballot|filing|form|application|request|complaint|accessibility|translate|language|font size|text size|high contrast|dark mode)\b/i;

// Known non-name strings that look like "Firstname Lastname" but aren't people
const NAME_NOISE = new Set([
  'board of', 'district one', 'district two', 'district three', 'district four',
  'district five', 'district six', 'district seven', 'district eight', 'district nine',
  'city council', 'school board', 'board members', 'members board', 'chair board',
  'county board', 'county commission', 'board meeting', 'school district',
  'independent school', 'public schools', 'unified school', 'meeting agenda',
  'meeting minutes', 'regular meeting', 'special meeting', 'work session',
  'court commissioner', 'commissioners court',
]);

const NAME_REGEX = /\b([A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z]+){1,3})\b/g;

function isValidMemberName(name) {
  if (!name) return false;
  const lower = name.toLowerCase();

  // Check against known noise phrases
  if (NAME_NOISE.has(lower)) return false;
  // Check for any noise word substring
  for (const phrase of NAME_NOISE) {
    if (lower.includes(phrase)) return false;
  }

  // Reject if it contains UI/nav words
  if (UI_NOISE.test(name)) return false;

  // Run through the shared cleanName validator (handles titles, org names, digits, etc.)
  if (!cleanName(name)) return false;

  return true;
}

function extractMembers(html) {
  const results = [];
  const seen = new Set();

  // Pass 1: structured blocks
  const blockRegex = /<(?:div|article|li|section)[^>]*class="[^"]*(?:member|council|trustee|supervisor|board-?member|director|card|commissioner|elected|representative|alderm)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li|section)>/gi;
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

  // Skip blocks that are clearly navigation or structural content
  if (UI_NOISE.test(text) && text.length < 80) return;

  let nameMatch;
  NAME_REGEX.lastIndex = 0;
  while ((nameMatch = NAME_REGEX.exec(text)) !== null) {
    const name = nameMatch[1].trim();
    if (!isValidMemberName(name)) continue;
    if (name.split(/\s+/).length < 2) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // Role hints
    const lower = text.toLowerCase();
    let role = null;
    if (/vice\s*chair/.test(lower)) role = 'Vice Chair';
    else if (/\bchair\b/.test(lower) || /chairman/i.test(lower) || /chairwoman/i.test(lower)) role = 'Chair';
    else if (/at[-\s]?large/i.test(text)) role = 'At-Large';
    else if (/\bpresident\b/.test(lower)) role = 'President';
    else if (/vice\s*president/.test(lower)) role = 'Vice President';

    let district = null;
    const dMatch = text.match(/\b(?:District|Ward|Borough|Precinct|Seat)\s+([A-Za-z0-9]+)/);
    if (dMatch) district = dMatch[1];

    results.push({ name, role, district });
    break; // one name per block
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'politicker-scraper/1.0 (civic data)' } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

module.exports = { fetchHtml, extractMembers };
