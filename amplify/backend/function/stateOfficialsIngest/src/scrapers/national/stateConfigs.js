/**
 * Per-state scraper configurations. Each state has the best known single-source URL
 * for each official category, plus an extraction strategy hint.
 *
 * Strategies:
 *   'table'     -- HTML table with rows of [county, name] or [rank, county, name, date]
 *   'links'     -- <a> elements with "County - Name" or "Name - County" text
 *   'blocks'    -- div/li with class containing member/sheriff/card
 *   'text'      -- free-form text with "Sheriff Name -- County" patterns
 *   'hardcoded' -- officials embedded directly in the config (most reliable)
 *   'skip'      -- no known source; skip this category for this state
 *
 * Adding a new state = add its entry here. The engine in allStates.js processes them all.
 */

const ALL_STRATEGIES = ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'];
const SKIP = { url: null, strategies: ['skip'] };

module.exports = {
  // --- TOP 10 BY POPULATION ---

  // CA, TX, FL, NY, PA, IL handled by dedicated deep scrapers -- skip in allStates engine
  CA: { name: 'California', sheriffs: SKIP, judges: SKIP, countyBoard: SKIP, schoolBoard: SKIP },
  TX: { name: 'Texas', sheriffs: SKIP, judges: SKIP, countyBoard: SKIP, schoolBoard: SKIP },
  FL: { name: 'Florida', sheriffs: SKIP, judges: SKIP, countyBoard: SKIP, schoolBoard: SKIP },
  NY: { name: 'New York', sheriffs: SKIP, judges: SKIP, countyBoard: SKIP, schoolBoard: SKIP },
  PA: { name: 'Pennsylvania', sheriffs: SKIP, judges: SKIP, countyBoard: SKIP, schoolBoard: SKIP },
  IL: { name: 'Illinois', sheriffs: SKIP, judges: SKIP, countyBoard: SKIP, schoolBoard: SKIP },

  OH: {
    name: 'Ohio',
    sheriffs: { url: 'https://www.buckeyesheriffs.org/sheriffs/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://education.ohio.gov/State-Board/State-Board-Members', strategies: ALL_STRATEGIES },
  },

  GA: {
    name: 'Georgia',
    sheriffs: { url: 'https://georgiasheriffs.org/resources/sheriffs-by-county/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.gadoe.org/External-Affairs-and-Policy/State-Board-of-Education/Pages/default.aspx', strategies: ALL_STRATEGIES },
  },

  NC: {
    name: 'North Carolina',
    sheriffs: { url: 'https://ncsheriffs.org/find-a-sheriff', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.dpi.nc.gov/about-dpi/education-directory/state-board-education-members', strategies: ALL_STRATEGIES },
  },

  MI: {
    name: 'Michigan',
    sheriffs: { url: 'https://www.misheriff.org/sheriffs-offices/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.michigan.gov/mde/about/state-board-of-education/sbe-members', strategies: ALL_STRATEGIES },
  },

  // --- STATES 11-25 ---

  NJ: {
    name: 'New Jersey',
    sheriffs: { url: 'https://www.njsheriff.org/sheriffs/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.nj.gov/education/sboe/members/', strategies: ALL_STRATEGIES },
  },
  AZ: {
    name: 'Arizona',
    sheriffs: { url: 'https://azsheriffs.org/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://azsbe.az.gov/meet-board', strategies: ALL_STRATEGIES },
  },
  TN: {
    name: 'Tennessee',
    sheriffs: { url: 'https://d25lo6stcmrt9n.cloudfront.net/sheriffDirectory', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.tn.gov/sbe/about-the-state-board/board-members.html', strategies: ALL_STRATEGIES },
  },
  IN: {
    name: 'Indiana',
    sheriffs: { url: 'https://www.in.gov/sheriffs/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.in.gov/sboe/board-members/', strategies: ALL_STRATEGIES },
  },
  MO: {
    name: 'Missouri',
    sheriffs: { url: 'https://data.mo.gov/resource/pzip-wwk6.json?$limit=200', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://dese.mo.gov/state-board-education/board-members', strategies: ALL_STRATEGIES },
  },
  MD: {
    name: 'Maryland',
    sheriffs: { url: 'https://www.mdsheriffs.org/meet-the-sheriffs', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.marylandpublicschools.org/stateboard/Pages/members.aspx', strategies: ALL_STRATEGIES },
  },
  WI: {
    name: 'Wisconsin',
    sheriffs: { url: 'https://www.badgerstatesheriffs.org/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: SKIP, // WI has no traditional state board of education
  },
  CO: {
    name: 'Colorado',
    sheriffs: { url: 'https://www.coloradosheriffs.org/counties', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.cde.state.co.us/cdeboard/sbemembers', strategies: ALL_STRATEGIES },
  },
  MN: {
    name: 'Minnesota',
    sheriffs: { url: 'https://www.mnsheriffs.org/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: SKIP, // MN eliminated its state board of education
  },
  SC: {
    name: 'South Carolina',
    sheriffs: { url: 'https://www.sheriffsc.org/county_map/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://ed.sc.gov/state-board/state-board-of-education/about-state-board/state-board-members-information-and-biographies/', strategies: ALL_STRATEGIES },
  },
  AL: {
    name: 'Alabama',
    sheriffs: { url: 'https://www.alabamasheriffs.com/sheriffs-directory', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.alabamaachieves.org/board/board-members/', strategies: ALL_STRATEGIES },
  },
  LA: {
    name: 'Louisiana',
    sheriffs: { url: 'https://lsa.org/sheriffs-directory/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://bfrss.la.gov/bese/board-members/', strategies: ALL_STRATEGIES },
  },
  KY: {
    name: 'Kentucky',
    sheriffs: { url: 'https://www.kysheriffs.org/sheriff-directory', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: { url: 'https://kaco.org/county-information/county-officials-directory/', strategies: ALL_STRATEGIES },
    schoolBoard: { url: 'https://education.ky.gov/comm/about/Pages/Kentucky-Board-of-Education.aspx', strategies: ALL_STRATEGIES },
  },
  OR: {
    name: 'Oregon',
    sheriffs: { url: 'https://oregonsheriffs.org/meet-your-sheriffs/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.oregon.gov/ode/about-us/stateboard/Pages/default.aspx', strategies: ALL_STRATEGIES },
  },
  OK: {
    name: 'Oklahoma',
    sheriffs: { url: 'https://oklahomasheriffs.org/current-ok-sheriffs', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://sde.ok.gov/state-board-education-members', strategies: ALL_STRATEGIES },
  },

  // --- STATES 26-50 ---

  IA: {
    name: 'Iowa',
    sheriffs: { url: 'https://www.issda.org/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://educate.iowa.gov/about-us/state-board-education/state-board-members', strategies: ALL_STRATEGIES },
  },
  KS: {
    name: 'Kansas',
    sheriffs: { url: 'https://www.kansassheriffs.org/association_directory_view.php?position=members&sort_by=county', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.ksde.org/Board/Kansas-State-Board-of-Education/Board-Members', strategies: ALL_STRATEGIES },
  },
  AR: {
    name: 'Arkansas',
    sheriffs: { url: 'https://arsheriffs.org/asa-directory/sheriff-directory/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://dese.ade.arkansas.gov/offices/state-board-of-education/state-board-members', strategies: ALL_STRATEGIES },
  },
  MS: {
    name: 'Mississippi',
    sheriffs: { url: 'https://www.mssheriff.org/directory', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.mdek12.org/MBE/Members', strategies: ALL_STRATEGIES },
  },
  NE: {
    name: 'Nebraska',
    sheriffs: { url: 'https://www.nebraskasheriffsassociation.com/sheriffs-1', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.education.ne.gov/state-board-of-education/board-members/', strategies: ALL_STRATEGIES },
  },
  NM: {
    name: 'New Mexico',
    sheriffs: { url: 'https://nmsheriffs.org/new-mexico-county-sheriffs/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://webnew.ped.state.nm.us/bureaus/public-education-commission/ped-members/', strategies: ALL_STRATEGIES },
  },
  ID: {
    name: 'Idaho',
    sheriffs: { url: 'https://www.idahosheriffs.org/meet-the-sheriffs/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://boardofed.idaho.gov/board-members/', strategies: ALL_STRATEGIES },
  },
  WV: {
    name: 'West Virginia',
    sheriffs: { url: 'https://www.wvsheriff.org/?page_id=21', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://wvde.us/state-board-of-education/board-members/', strategies: ALL_STRATEGIES },
  },
  MT: {
    name: 'Montana',
    sheriffs: { url: 'https://www.mspoa.org/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://bpe.mt.gov/Board-Members', strategies: ALL_STRATEGIES },
  },
  ND: {
    name: 'North Dakota',
    sheriffs: { url: 'https://post.nd.gov/LawEnforcementAgencies/SheriffsDepartments.html', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.nd.gov/dpi/about/state-board-public-school-education', strategies: ALL_STRATEGIES },
  },
  SD: {
    name: 'South Dakota',
    sheriffs: { url: 'https://www.southdakotasheriffs.org/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://doe.sd.gov/board/', strategies: ALL_STRATEGIES },
  },
  UT: {
    name: 'Utah',
    sheriffs: { url: 'https://www.utahsheriffs.org/sheriffs/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.schools.utah.gov/board/members', strategies: ALL_STRATEGIES },
  },
  WA: {
    name: 'Washington',
    sheriffs: { url: 'https://www.waspc.org/', strategies: ALL_STRATEGIES },
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.sbe.wa.gov/about-us/board-members', strategies: ALL_STRATEGIES },
  },

  // States with no/limited sheriff association directory
  AK: {
    name: 'Alaska',
    sheriffs: SKIP, // Alaska has no county sheriffs -- state troopers
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://education.alaska.gov/State_Board', strategies: ALL_STRATEGIES },
  },
  CT: {
    name: 'Connecticut',
    sheriffs: SKIP, // CT abolished county government
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://portal.ct.gov/sbe/about/members', strategies: ALL_STRATEGIES },
  },
  DE: {
    name: 'Delaware',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://education.delaware.gov/community/state-board-of-education/', strategies: ALL_STRATEGIES },
  },
  HI: {
    name: 'Hawaii',
    sheriffs: SKIP, // No county sheriffs
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://boe.hawaii.gov/Members/Pages/default.aspx', strategies: ALL_STRATEGIES },
  },
  MA: {
    name: 'Massachusetts',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.doe.mass.edu/bese/members/', strategies: ALL_STRATEGIES },
  },
  ME: {
    name: 'Maine',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.maine.gov/doe/about/stateboard', strategies: ALL_STRATEGIES },
  },
  NH: {
    name: 'New Hampshire',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://www.education.nh.gov/who-we-are/state-board-of-education/state-board-education-members', strategies: ALL_STRATEGIES },
  },
  NV: {
    name: 'Nevada',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://doe.nv.gov/State_Board_of_Education/Members/', strategies: ALL_STRATEGIES },
  },
  RI: {
    name: 'Rhode Island',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://ride.ri.gov/about/council-elementary-secondary-education/council-members', strategies: ALL_STRATEGIES },
  },
  VT: {
    name: 'Vermont',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://education.vermont.gov/state-board-of-education/state-board-members', strategies: ALL_STRATEGIES },
  },
  WY: {
    name: 'Wyoming',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: { url: 'https://edu.wyoming.gov/board-of-education/board-members/', strategies: ALL_STRATEGIES },
  },

  // VA handled by dedicated deep scraper -- skip here
  VA: {
    name: 'Virginia',
    sheriffs: SKIP,
    judges: SKIP,
    countyBoard: SKIP,
    schoolBoard: SKIP,
  },
};
