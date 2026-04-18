/**
 * PA County Councils / Boards of Commissioners for top-10 PA counties.
 * Uses the shared localities registry + generic extractor. Each locality that fails (404, parsing
 * found nothing) is logged but doesn't crash the scraper.
 *
 * PA counties use either "County Council" (home-rule charter counties like Philadelphia,
 * Allegheny, Delaware) or "Board of Commissioners" (standard counties).
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
        // Use the county-specific board label (County Council vs Board of Commissioners)
        const baseOffice = loc.boardLabel || 'Board of Commissioners';
        const officeTitle = `${baseOffice} Member`;
        items.push({
          id: makeId('PA', 'county-board', (normLoc || '').toLowerCase(), cleaned.toLowerCase()),
          data: {
            category: 'county-board',
            state: 'PA',
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
  console.log(`PA county boards total: ${items.length}`);
  return items;
}

module.exports = { scrape };
