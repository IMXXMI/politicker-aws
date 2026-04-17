/**
 * Socrata API scraper — queries each state's open data portal for elected officials datasets.
 * Socrata provides a standard JSON API across all portals.
 *
 * Strategy: for each state portal, search for datasets matching keywords
 * (school board, sheriff, elected officials, board of education, county officials).
 * For each hit, fetch the data and map to our schema.
 */
const { nameTokens, makeId } = require('../../common/firestore');

const SEARCH_TERMS = [
  'school board members',
  'board of education members',
  'elected officials',
  'county officials',
  'sheriff',
];

// State portal domains from the user's table
const STATE_PORTALS = {
  AL: 'data.alabama.gov', AK: 'data.alaska.gov', AZ: 'data.az.gov', AR: 'data.arkansas.gov',
  CA: 'data.ca.gov', CO: 'data.colorado.gov', CT: 'data.ct.gov', DE: 'data.delaware.gov',
  FL: 'data.myflorida.com', GA: 'data.ga.gov', HI: 'data.hawaii.gov', ID: 'data.idaho.gov',
  IL: 'data.illinois.gov', IN: 'data.in.gov', IA: 'data.iowa.gov', KS: 'data.ks.gov',
  KY: 'data.ky.gov', LA: 'data.louisiana.gov', ME: 'data.maine.gov', MD: 'data.maryland.gov',
  MA: 'data.mass.gov', MI: 'data.michigan.gov', MN: 'data.mn.gov', MS: 'data.ms.gov',
  MO: 'data.mo.gov', MT: 'data.mt.gov', NE: 'data.nebraska.gov', NV: 'data.nv.gov',
  NH: 'data.nh.gov', NJ: 'data.nj.gov', NM: 'data.nm.gov', NY: 'data.ny.gov',
  NC: 'data.nconemap.gov', ND: 'data.nd.gov', OH: 'data.ohio.gov', OK: 'data.ok.gov',
  OR: 'data.oregon.gov', PA: 'data.pa.gov', RI: 'data.ri.gov', SC: 'data.sc.gov',
  SD: 'data.sd.gov', TN: 'data.tn.gov', TX: 'data.texas.gov', UT: 'data.utah.gov',
  VT: 'data.vermont.gov', VA: 'data.virginia.gov', WA: 'data.wa.gov', WV: 'data.wv.gov',
  WI: 'data.wi.gov', WY: 'data.wyo.gov',
};

const HEADERS = { 'User-Agent': 'politicker-scraper/1.0 (civic data)' };

function categorizeDataset(name, desc) {
  const t = `${name} ${desc}`.toLowerCase();
  if (t.includes('school board') || t.includes('board of education') || t.includes('education board')) return 'school-board';
  if (t.includes('sheriff')) return 'sheriff';
  if (t.includes('county official') || t.includes('elected official') || t.includes('commissioner') || t.includes('supervisor')) return 'county-board';
  if (t.includes('judge') || t.includes('court') || t.includes('justice')) return 'state-judge';
  return 'county-board'; // default
}

function extractOfficialFromRow(row, stateCode, category) {
  // Try common Socrata field names for name/county/office
  const name =
    row.name || row.full_name || row.member_name || row.official_name ||
    row.sheriff_name || row.sheriff || row.board_member ||
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    [row.firstname, row.lastname].filter(Boolean).join(' ') ||
    '';
  if (!name || name.length < 3) return null;

  const locality =
    row.county || row.county_name || row.district || row.district_name ||
    row.jurisdiction || row.locality || row.school_district || row.parish ||
    null;

  const office =
    row.office || row.title || row.position || row.role || row.office_title ||
    (category === 'sheriff' ? 'Sheriff' : category === 'school-board' ? 'Board of Education Member' : 'County Official');

  const phone = row.phone || row.phone_number || row.telephone || null;
  const email = row.email || row.email_address || null;
  const website = row.website || row.url || row.web || null;

  return {
    id: makeId(stateCode, category, (locality || '').toLowerCase(), name.toLowerCase()),
    data: {
      category,
      state: stateCode,
      locality: locality ? String(locality).trim() : null,
      localityLower: locality ? String(locality).toLowerCase().replace(/\s+(county|parish|borough|city)$/i, '').trim() : null,
      office: String(office).trim(),
      name: String(name).replace(/^(Sheriff|Judge|Hon\.?|Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i, '').trim(),
      nameTokens: nameTokens(name),
      party: row.party || row.party_affiliation || null,
      tookOffice: row.start_date || row.date_elected || row.term_start || null,
      termEnds: row.end_date || row.term_end || null,
      contact: { phone, email, website },
      photo: null,
      sourceUrl: `https://${STATE_PORTALS[stateCode]}`,
      castsVotes: category === 'school-board' || category === 'county-board',
      voteRecordsUrl: null,
    },
  };
}

async function scrape() {
  const allItems = [];
  const stats = { statesSearched: 0, datasetsFound: 0, officialsFetched: 0, errors: 0 };

  for (const [stateCode, domain] of Object.entries(STATE_PORTALS)) {
    stats.statesSearched++;
    for (const term of SEARCH_TERMS) {
      try {
        // Socrata Discovery API — search for datasets
        const searchUrl = `https://api.us.socrata.com/api/catalog/v1?q=${encodeURIComponent(term)}&domains=${domain}&limit=3`;
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        if (!searchRes.ok) continue;
        const searchData = await searchRes.json();
        const results = searchData.results || [];

        for (const result of results) {
          const resource = result.resource || {};
          const datasetId = resource.id;
          if (!datasetId) continue;

          const dsName = resource.name || '';
          const dsDesc = resource.description || '';
          const category = categorizeDataset(dsName, dsDesc);

          // Only fetch datasets that look like they have individual people
          const combined = `${dsName} ${dsDesc}`.toLowerCase();
          if (!combined.match(/member|official|sheriff|board|elected|officer|commissioner|supervisor|judge/)) continue;

          try {
            // Fetch actual data rows
            const dataUrl = `https://${domain}/resource/${datasetId}.json?$limit=500`;
            const dataRes = await fetch(dataUrl, { headers: HEADERS });
            if (!dataRes.ok) continue;
            const rows = await dataRes.json();
            if (!Array.isArray(rows) || rows.length === 0) continue;

            stats.datasetsFound++;
            let count = 0;
            const seen = new Set();
            for (const row of rows) {
              const official = extractOfficialFromRow(row, stateCode, category);
              if (!official) continue;
              const key = `${stateCode}|${official.data.name}|${official.data.category}`.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              allItems.push(official);
              count++;
            }
            if (count > 0) {
              console.log(`  [Socrata] ${stateCode} "${dsName}": ${count} officials (${category})`);
              stats.officialsFetched += count;
            }
          } catch (e) {
            stats.errors++;
          }
        }
      } catch (e) {
        stats.errors++;
      }
    }
  }

  console.log(`Socrata discovery: searched ${stats.statesSearched} states, found ${stats.datasetsFound} datasets, ${stats.officialsFetched} officials, ${stats.errors} errors`);
  return allItems;
}

module.exports = { scrape };
