/**
 * FL County Commissions for top-10 FL counties. FL uses "County Commission" rather than
 * "Board of Supervisors" — office title is "County Commissioner".
 * Uses the shared localities registry + generic extractor from VA.
 * Per-locality failures are logged but don't crash the scraper.
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
        console.log(`  [CountyBoard] ${loc.locality}: using ${members.length} hardcoded members`);
      } else {
        const html = await fetchHtml(loc.bosUrl);
        members = extractMembers(html);
        if (members.length === 0) {
          console.warn(`  [CountyBoard] ${loc.locality}: page fetched but no members extracted`);
          continue;
        }
      }
      const { locality: normLoc, localityLower } = normalizeLocality(loc.locality);
      for (const mem of members) {
        const cleaned = cleanName(mem.name);
        if (!cleaned) continue;
        const office = mem.role ? `County Commissioner (${mem.role})` : 'County Commissioner';
        items.push({
          id: makeId('FL', 'county-board', (normLoc || '').toLowerCase(), cleaned.toLowerCase()),
          data: {
            category: 'county-board',
            state: 'FL',
            locality: normLoc,
            localityLower,
            office,
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
      console.log(`  [CountyBoard] ${loc.locality}: ${members.length} members`);
    } catch (e) {
      console.warn(`  [CountyBoard] ${loc.locality}: ${e.message}`);
    }
  }
  console.log(`FL county boards total: ${items.length}`);
  return items;
}

module.exports = { scrape };
