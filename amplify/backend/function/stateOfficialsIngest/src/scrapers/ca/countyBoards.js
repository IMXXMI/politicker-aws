/**
 * CA county Boards of Supervisors for top-10 CA counties.
 * Uses the shared localities registry + generic VA extractor. Each locality that fails (404,
 * parsing found nothing) is logged but doesn't crash the scraper.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');
const localities = require('./localities');
const { fetchHtml, extractMembers } = require('../va/extractor');

async function scrape() {
  const items = [];
  for (const loc of localities) {
    if (!loc.bosUrl && !loc.bosMembers) continue;
    try {
      // Use hardcoded members if available (most reliable); fall back to scraping
      let members;
      if (loc.bosMembers && loc.bosMembers.length > 0) {
        members = loc.bosMembers;
        console.log(`  [BoS] ${loc.locality}: using ${members.length} hardcoded members`);
      } else {
        const html = await fetchHtml(loc.bosUrl);
        members = extractMembers(html);
        if (members.length === 0) {
          console.warn(`  [BoS] ${loc.locality}: page fetched but no members extracted`);
          continue;
        }
      }
      const { locality: normLoc, localityLower } = normalizeLocality(loc.locality);
      for (const mem of members) {
        const cleaned = cleanName(mem.name);
        if (!cleaned) continue;
        const office = 'Board of Supervisors Member';
        items.push({
          id: makeId('CA', 'county-board', (normLoc || '').toLowerCase(), cleaned.toLowerCase()),
          data: {
            category: 'county-board',
            state: 'CA',
            locality: normLoc,
            localityLower,
            office: mem.role ? `${office} (${mem.role})` : office,
            name: cleaned,
            nameTokens: nameTokens(cleaned),
            party: null,
            tookOffice: null,
            termEnds: null,
            contact: {},
            photo: null,
            sourceUrl: loc.bosUrl,
            castsVotes: true,
            voteRecordsUrl: loc.bosUrl,
            district: mem.district,
          },
        });
      }
      console.log(`  [BoS] ${loc.locality}: ${members.length} members`);
    } catch (e) {
      console.warn(`  [BoS] ${loc.locality}: ${e.message}`);
    }
  }
  console.log(`CA county boards total: ${items.length}`);
  return items;
}

module.exports = { scrape };
