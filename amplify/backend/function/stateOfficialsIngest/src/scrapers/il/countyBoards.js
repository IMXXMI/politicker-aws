/**
 * IL County Boards for top-10 IL counties.
 * Uses the shared localities registry + generic extractor. Each locality that fails (404, parsing
 * found nothing) is logged but doesn't crash the scraper.
 *
 * IL uses "County Board" — office title is "County Board Member".
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');
const localities = require('./localities');
const { fetchHtml, extractMembers } = require('../va/extractor');

async function scrape() {
  const items = [];
  for (const loc of localities) {
    if (!loc.bosUrl && !loc.bosMembers) continue;
    try {
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
        const officeTitle = 'County Board Member';
        items.push({
          id: makeId('IL', 'county-board', (normLoc || '').toLowerCase(), cleaned.toLowerCase()),
          data: {
            category: 'county-board',
            state: 'IL',
            locality: normLoc,
            localityLower,
            office: mem.role ? `${officeTitle} (${mem.role})` : officeTitle,
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
  console.log(`IL county boards total: ${items.length}`);
  return items;
}

module.exports = { scrape };
