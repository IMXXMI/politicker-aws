/**
 * Socrata API scraper — queries each state's open data portal for elected officials datasets.
 * Socrata provides a standard JSON API across all portals.
 *
 * Strategy: for each state portal, search for datasets matching keywords
 * (school board, sheriff, elected officials, board of education, county officials).
 * For each hit, fetch the data and map to our schema.
 */
const { nameTokens, makeId, normalizeLocality, cleanName } = require('../../common/firestore');

const SEARCH_TERMS = [
  'school board members',
  'board of education members',
  'elected officials',
  'county officials',
  'sheriff',
  'local officials',
  'commissioner',
  'municipal officials',
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

/**
 * Reject datasets that matched search terms but are clearly not about elected officials.
 * Socrata search is full-text, so "board of education" matches nursing home complaint reports.
 */
const DATASET_BLACKLIST = /complaint|salary|insurance|premium|accredit|certif|license|permit|lobbyist|lobbying|registration|docket|mediation|tax|property|real estate|crime|incident|arrest|inmate|prisoner|violation|inspection|assessment|expenditure|revenue|budget|contract|procurement|bid|grant|loan|census|demographic|population|traffic|parking|water|sewer|utility|weather|covid|vaccine|hospital|nursing|health care|medicaid|medicare/i;

function categorizeDataset(name, desc) {
  const t = `${name} ${desc}`.toLowerCase();
  if (t.includes('school board') || t.includes('board of education') || t.includes('education board')) return 'school-board';
  if (t.includes('sheriff')) return 'sheriff';
  if (t.includes('county official') || t.includes('elected official') || t.includes('commissioner') || t.includes('supervisor')) return 'county-board';
  if (t.includes('judge') || t.includes('court') || t.includes('justice')) return 'state-judge';
  return 'county-board'; // default
}

/**
 * Check that a dataset's columns look like they contain elected officials.
 * Must have at least one name-like column. Rejects datasets about agencies, certifications, etc.
 */
function hasPersonColumns(columns) {
  if (!columns || columns.length === 0) return true; // no metadata, let row extraction decide
  const cols = columns.map(c => c.toLowerCase());
  const nameCol = cols.some(c =>
    /^(name|full_name|member|official|sheriff|person|first_name|last_name|incumbent|board_member|officeholder|representative)/.test(c)
  );
  return nameCol;
}

/**
 * State-specific Socrata field overrides. Some state portals use non-standard column names.
 * Keys are state codes; values override the default tryFields search order.
 */
const STATE_FIELD_OVERRIDES = {
  // Louisiana uses "parish" not "county"
  LA: { locality: ['parish', 'parish_name', 'county', 'district', 'jurisdiction'] },
  // Alaska uses "borough" or "census_area"
  AK: { locality: ['borough', 'borough_name', 'census_area', 'county', 'district', 'jurisdiction'] },
  // Virginia uses "locality" or "city_county"
  VA: { locality: ['locality', 'city_county', 'county', 'jurisdiction', 'district'] },
  // New York has boroughs
  NY: { locality: ['county', 'borough', 'district', 'jurisdiction', 'municipality'] },
  // Missouri Socrata often uses "county_desc" or "countydesc"
  MO: { locality: ['county_desc', 'countydesc', 'county', 'county_name', 'jurisdiction'] },
  // Tennessee uses "county" but sometimes "county_name" with different casing
  TN: { locality: ['county', 'county_name', 'countydesc', 'district', 'jurisdiction'] },
};

function extractOfficialFromRow(row, stateCode, category) {
  // Try every common column name variation -- each state uses different names
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

  const rawName = tryFields(row,
    'name', 'full_name', 'member_name', 'official_name', 'sheriff_name', 'sheriff',
    'board_member', 'person', 'officeholder', 'incumbent', 'elected_official',
    'officer_name', 'contact_name', 'representative', 'member'
  ) || [
    tryFields(row, 'first_name', 'firstname', 'first', 'given_name'),
    tryFields(row, 'last_name', 'lastname', 'last', 'family_name', 'surname')
  ].filter(Boolean).join(' ') || '';

  const name = cleanName(rawName);
  if (!name) return null;

  // Use state-specific locality field order if available
  const overrides = STATE_FIELD_OVERRIDES[stateCode];
  const localityKeys = (overrides && overrides.locality) || [
    'county', 'county_name', 'county_desc', 'countydesc', 'cnty',
    'district', 'district_name', 'school_district', 'district_desc',
    'jurisdiction', 'jurisdiction_name', 'juris',
    'locality', 'locale', 'location', 'location_name',
    'parish', 'parish_name', 'borough', 'borough_name',
    'municipality', 'municipal', 'city', 'city_name', 'town',
    'region', 'area', 'zone', 'precinct'
  ];
  const rawLocality = tryFields(row, ...localityKeys);
  const { locality, localityLower } = normalizeLocality(rawLocality);

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
      locality,
      localityLower,
      office: String(office).trim(),
      name,
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
          const combined = `${dsName} ${dsDesc}`.toLowerCase();

          // Reject datasets that are clearly not about elected officials
          if (DATASET_BLACKLIST.test(combined)) {
            console.log(`  [Socrata] ${stateCode} SKIP "${dsName}" (blacklisted)`);
            continue;
          }

          // Must mention people-related keywords
          if (!combined.match(/member|official|sheriff|board|elected|officer|commissioner|supervisor|judge|council|mayor|clerk|treasurer/)) continue;

          // Check columns look like they contain person data
          if (!hasPersonColumns(resource.columns_field_name)) {
            console.log(`  [Socrata] ${stateCode} SKIP "${dsName}" (no person columns)`);
            continue;
          }

          // Reject datasets that are too large — real official directories are typically <2000 rows
          if (resource.page_views && resource.page_views.page_views_total > 0) {
            // If we know the row count from metadata, skip huge datasets
          }

          const category = categorizeDataset(dsName, dsDesc);

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
            const batch = [];
            for (const row of rows) {
              const official = extractOfficialFromRow(row, stateCode, category);
              if (!official) continue;
              const key = `${stateCode}|${official.data.name}|${official.data.category}`.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              batch.push(official);
              count++;
            }
            // Sanity check: if we fetched 500 rows but extracted <10%, it's probably not an officials dataset
            if (rows.length >= 400 && count < rows.length * 0.1) {
              console.log(`  [Socrata] ${stateCode} SKIP "${dsName}": only ${count}/${rows.length} rows parsed — likely not officials`);
              continue;
            }
            if (count > 0) {
              allItems.push(...batch);
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
