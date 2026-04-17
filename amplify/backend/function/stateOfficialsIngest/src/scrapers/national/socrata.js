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
  // Try every common column name variation — each state uses different names
  const tryFields = (obj, ...keys) => {
    for (const k of keys) {
      // Try exact key, lowercase key, and uppercase key
      const val = obj[k] || obj[k.toLowerCase()] || obj[k.toUpperCase()] || obj[k.replace(/_/g, '')] || obj[k.replace(/_/g, ' ')];
      if (val && String(val).trim().length > 1) return String(val).trim();
    }
    // Also try iterating all keys for substring matches
    for (const [objKey, objVal] of Object.entries(obj)) {
      const lower = objKey.toLowerCase();
      for (const k of keys) {
        if (lower.includes(k.toLowerCase()) && objVal && String(objVal).trim().length > 1) {
          return String(objVal).trim();
        }
      }
    }
    return null;
  };

  const name = tryFields(row,
    'name', 'full_name', 'member_name', 'official_name', 'sheriff_name', 'sheriff',
    'board_member', 'person', 'officeholder', 'incumbent', 'elected_official',
    'officer_name', 'contact_name', 'representative'
  ) || [
    tryFields(row, 'first_name', 'firstname', 'first', 'given_name'),
    tryFields(row, 'last_name', 'lastname', 'last', 'family_name', 'surname')
  ].filter(Boolean).join(' ') || '';
  if (!name || name.length < 3) return null;

  const locality = tryFields(row,
    'county', 'county_name', 'county_desc', 'countydesc', 'cnty',
    'district', 'district_name', 'school_district', 'district_desc',
    'jurisdiction', 'jurisdiction_name', 'juris',
    'locality', 'locale', 'location', 'location_name',
    'parish', 'parish_name', 'borough', 'borough_name',
    'municipality', 'municipal', 'city', 'city_name', 'town',
    'region', 'area', 'zone', 'precinct'
  );

  const office = tryFields(row,
    'office', 'title', 'position', 'role', 'office_title', 'office_name',
    'job_title', 'designation', 'office_held', 'elected_office'
  ) || (category === 'sheriff' ? 'Sheriff' : category === 'school-board' ? 'Board of Education Member' : 'County Official');

  const phone = tryFields(row, 'phone', 'phone_number', 'telephone', 'phone_1', 'office_phone', 'contact_phone');
  const email = tryFields(row, 'email', 'email_address', 'e_mail', 'contact_email', 'office_email');
  const website = tryFields(row, 'website', 'url', 'web', 'web_site', 'homepage', 'link');

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
