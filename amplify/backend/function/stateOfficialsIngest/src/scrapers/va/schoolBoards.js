/**
 * VA school board members for top-10 VA localities. Same pattern as countyBoards.js —
 * registry-driven, generic extractor, per-locality failures logged not thrown.
 */
const { nameTokens, makeId } = require('../../common/firestore');
const localities = require('./localities');
const { fetchHtml, extractMembers } = require('./extractor');

async function scrape() {
  const items = [];
  for (const loc of localities) {
    if (!loc.schoolBoardUrl && !loc.schoolBoardMembers) continue;
    try {
      let members;
      if (loc.schoolBoardMembers && loc.schoolBoardMembers.length > 0) {
        members = loc.schoolBoardMembers;
        console.log(`  [SchoolBoard] ${loc.locality}: using ${members.length} hardcoded members`);
      } else {
        const html = await fetchHtml(loc.schoolBoardUrl);
        members = extractMembers(html);
        if (members.length === 0) {
          console.warn(`  [SchoolBoard] ${loc.locality}: page fetched but no members extracted`);
          continue;
        }
      }
      for (const mem of members) {
        const office = mem.role ? `School Board Member (${mem.role})` : 'School Board Member';
        items.push({
          id: makeId('VA', 'school-board', loc.locality.toLowerCase(), mem.name.toLowerCase()),
          data: {
            category: 'school-board',
            state: 'VA',
            locality: loc.locality,
            office,
            name: mem.name,
            nameTokens: nameTokens(mem.name),
            party: null,
            tookOffice: null,
            termEnds: null,
            contact: {},
            photo: null,
            sourceUrl: loc.schoolBoardUrl,
            castsVotes: true,
            voteRecordsUrl: loc.schoolBoardUrl,
            district: mem.district,
          },
        });
      }
      console.log(`  [SchoolBoard] ${loc.locality}: ${members.length} members`);
    } catch (e) {
      console.warn(`  [SchoolBoard] ${loc.locality}: ${e.message}`);
    }
  }
  console.log(`VA school boards total: ${items.length}`);
  return items;
}

module.exports = { scrape };
