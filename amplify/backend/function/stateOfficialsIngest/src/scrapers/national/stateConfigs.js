/**
 * Per-state scraper configurations. Each state has the best known single-source URL
 * for each official category, plus an extraction strategy hint.
 *
 * Strategies:
 *   'table'     — HTML table with rows of [county, name] or [rank, county, name, date]
 *   'links'     — <a> elements with "County - Name" or "Name - County" text
 *   'blocks'    — div/li with class containing member/sheriff/card
 *   'text'      — free-form text with "Sheriff Name — County" patterns
 *   'hardcoded' — officials embedded directly in the config (most reliable)
 *   'skip'      — no known source; skip this category for this state
 *
 * Adding a new state = add its entry here. The engine in allStates.js processes them all.
 */

module.exports = {
  // --- TOP 10 BY POPULATION ---

  CA: {
    name: 'California',
    sheriffs: {
      url: 'https://www.calsheriffs.org/sheriffs-directory',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: 'https://www.cde.ca.gov/be/ms/mm/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
  },

  TX: {
    name: 'Texas',
    sheriffs: {
      url: 'https://www.txsheriffs.org/texas-sheriffs-list',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: 'https://sboe.texas.gov/state-board-of-education/sboe-board-members/sboe-members', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
  },

  FL: {
    name: 'Florida',
    sheriffs: {
      url: 'https://flsheriffs.org/',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: 'https://www.fldoe.org/policy/state-board-of-edu/members/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
  },

  NY: {
    name: 'New York',
    sheriffs: {
      url: 'https://www.nysheriffs.org/sheriffs',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },

  PA: {
    name: 'Pennsylvania',
    sheriffs: {
      url: 'https://pasheriffs.org/sheriffs/',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: 'https://www.pa.gov/agencies/stateboard/about-the-board/board-members', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
  },

  IL: {
    name: 'Illinois',
    sheriffs: {
      url: 'https://www.restorejustice.org/illinois-sheriffs-contact-information/',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },

  OH: {
    name: 'Ohio',
    sheriffs: {
      url: 'https://www.buckeyesheriffs.org/sheriffs/',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },

  GA: {
    name: 'Georgia',
    sheriffs: {
      url: 'https://georgiasheriffs.org/resources/sheriffs-by-county/',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },

  NC: {
    name: 'North Carolina',
    sheriffs: {
      url: 'https://ncsheriffs.org/find-a-sheriff',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: 'https://www.dpi.nc.gov/about-dpi/education-directory/state-board-education-members', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
  },

  MI: {
    name: 'Michigan',
    sheriffs: {
      url: 'https://www.misheriff.org/sheriffs-offices/',
      strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'],
    },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },

  // --- STATES 11-25 ---

  NJ: {
    name: 'New Jersey',
    sheriffs: { url: 'https://www.njsheriff.org/sheriffs/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  AZ: {
    name: 'Arizona',
    sheriffs: { url: 'https://azsheriffs.org/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  TN: {
    name: 'Tennessee',
    sheriffs: { url: 'https://d25lo6stcmrt9n.cloudfront.net/sheriffDirectory', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  IN: {
    name: 'Indiana',
    sheriffs: { url: 'https://www.in.gov/sheriffs/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  MO: {
    name: 'Missouri',
    sheriffs: { url: 'https://data.mo.gov/resource/pzip-wwk6.json?$limit=200', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  MD: {
    name: 'Maryland',
    sheriffs: { url: 'https://www.mdsheriffs.org/meet-the-sheriffs', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  WI: {
    name: 'Wisconsin',
    sheriffs: { url: 'https://www.badgerstatesheriffs.org/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  CO: {
    name: 'Colorado',
    sheriffs: { url: 'https://www.coloradosheriffs.org/counties', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  MN: {
    name: 'Minnesota',
    sheriffs: { url: 'https://www.mnsheriffs.org/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  SC: {
    name: 'South Carolina',
    sheriffs: { url: 'https://www.sheriffsc.org/county_map/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: 'https://ed.sc.gov/state-board/state-board-of-education/about-state-board/state-board-members-information-and-biographies/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
  },
  AL: {
    name: 'Alabama',
    sheriffs: { url: 'https://www.alabamasheriffs.com/sheriffs-directory', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  LA: {
    name: 'Louisiana',
    sheriffs: { url: 'https://lsa.org/sheriffs-directory/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  KY: {
    name: 'Kentucky',
    sheriffs: { url: 'https://kaco.org/county-information/county-officials-directory/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  OR: {
    name: 'Oregon',
    sheriffs: { url: 'https://oregonsheriffs.org/meet-your-sheriffs/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },
  OK: {
    name: 'Oklahoma',
    sheriffs: { url: 'https://oklahomasheriffs.org/current-ok-sheriffs', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] },
    judges: { url: null, strategies: ['skip'] },
    countyBoard: { url: null, strategies: ['skip'] },
    schoolBoard: { url: null, strategies: ['skip'] },
  },

  // --- STATES 26-50 ---

  IA: { name: 'Iowa', sheriffs: { url: 'https://www.issda.org/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  KS: { name: 'Kansas', sheriffs: { url: 'https://www.kansassheriffs.org/association_directory_view.php?position=members&sort_by=county', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  AR: { name: 'Arkansas', sheriffs: { url: 'https://arsheriffs.org/asa-directory/sheriff-directory/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  MS: { name: 'Mississippi', sheriffs: { url: 'https://www.mssheriff.org/directory', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  NE: { name: 'Nebraska', sheriffs: { url: 'https://www.nebraskasheriffsassociation.com/sheriffs-1', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  NM: { name: 'New Mexico', sheriffs: { url: 'https://nmsheriffs.org/new-mexico-county-sheriffs/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  ID: { name: 'Idaho', sheriffs: { url: 'https://www.idahosheriffs.org/meet-the-sheriffs/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  WV: { name: 'West Virginia', sheriffs: { url: 'https://www.wvsheriff.org/?page_id=21', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  MT: { name: 'Montana', sheriffs: { url: 'https://www.mspoa.org/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  ND: { name: 'North Dakota', sheriffs: { url: 'https://post.nd.gov/LawEnforcementAgencies/SheriffsDepartments.html', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  SD: { name: 'South Dakota', sheriffs: { url: 'https://www.southdakotasheriffs.org/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  UT: { name: 'Utah', sheriffs: { url: 'https://www.utahsheriffs.org/sheriffs/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  WA: { name: 'Washington', sheriffs: { url: 'https://www.waspc.org/', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },

  // States with no known sheriff association directory
  AK: { name: 'Alaska', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  CT: { name: 'Connecticut', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  DE: { name: 'Delaware', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  HI: { name: 'Hawaii', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  MA: { name: 'Massachusetts', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  ME: { name: 'Maine', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  NH: { name: 'New Hampshire', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: 'https://www.education.nh.gov/who-we-are/state-board-of-education/state-board-education-members', strategies: ['table', 'blocks', 'links', 'headings', 'bold', 'sheriffNames', 'posts', 'text', 'broad'] } },
  NV: { name: 'Nevada', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  RI: { name: 'Rhode Island', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  VT: { name: 'Vermont', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
  WY: { name: 'Wyoming', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },

  // VA handled by dedicated deep scraper — skip here
  VA: { name: 'Virginia', sheriffs: { url: null, strategies: ['skip'] }, judges: { url: null, strategies: ['skip'] }, countyBoard: { url: null, strategies: ['skip'] }, schoolBoard: { url: null, strategies: ['skip'] } },
};
