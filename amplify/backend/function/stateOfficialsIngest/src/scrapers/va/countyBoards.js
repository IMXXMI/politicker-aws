/**
 * VA county Boards of Supervisors + city Councils for top-10 VA localities.
 * Uses the shared localities registry + generic extractor. Each locality that fails (404, parsing
 * found nothing) is logged but doesn't crash the scraper.
 */
const { nameTokens, makeId } = require('../../common/firestore');
const localities = require('./localities');
const { fetchHtml, extractMembers } = require('./extractor');

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
      for (const mem of members) {
        const office = loc.kind === 'city' ? 'City Council Member' : 'Board of Supervisors Member';
        items.push({
          id: makeId('VA', 'county-board', loc.locality.toLowerCase(), mem.name.toLowerCase()),
          data: {
            category: 'county-board',
            state: 'VA',
            locality: loc.locality,
            localityLower: (loc.locality || '').toLowerCase().replace(/\s+(county|parish|borough|city)$/i, '').trim(),
            office: mem.role ? `${office} (${mem.role})` : office,
            name: mem.name,
            nameTokens: nameTokens(mem.name),
            party: null,
            tookOffice: null,
            termEnds: null,
            contact: {},
            photo: null,
            sourceUrl: loc.bosUrl,
            castsVotes: true,
            voteRecordsUrl: loc.bosUrl,  // link-out until per-locality vote scraping is built
            district: mem.district,
          },
        });
      }
      console.log(`  [BoS] ${loc.locality}: ${members.length} members`);
    } catch (e) {
      console.warn(`  [BoS] ${loc.locality}: ${e.message}`);
    }
  }
  console.log(`VA county boards total: ${items.length}`);
  return items;
}

module.exports = { scrape };
