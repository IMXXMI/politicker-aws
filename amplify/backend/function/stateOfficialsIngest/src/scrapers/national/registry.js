/**
 * National registry — maps every US state to its best free public data sources
 * for county-level officials. Used by the national scrapers to iterate all 50 states.
 *
 * Source types:
 *   sheriffAssocUrl: State sheriff's association member directory page
 *   courtDirectoryUrl: State judiciary's judge/justice directory page
 *   countyAssocUrl: State association of counties (board members)
 *   schoolBoardAssocUrl: State school boards association directory
 *
 * null = no known free source for that category in this state.
 * Some states don't have county sheriffs (CT, HI, AK in some areas).
 */

module.exports = {
  AL: {
    name: 'Alabama',
    sheriffAssocUrl: 'https://www.alsheriffs.com/county-sheriffs/',
    courtDirectoryUrl: 'https://judicial.alabama.gov/about/JudicialDirectory',
    countyAssocUrl: 'https://www.acca-online.org/countycommissions',
    schoolBoardAssocUrl: null,
  },
  AK: {
    name: 'Alaska',
    sheriffAssocUrl: null, // Alaska has no county sheriffs — state troopers
    courtDirectoryUrl: 'https://courts.alaska.gov/judges/index.htm',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  AZ: {
    name: 'Arizona',
    sheriffAssocUrl: 'https://www.azsheriffs.org/sheriffs',
    courtDirectoryUrl: 'https://www.azcourts.gov/courts/Courts-of-Arizona',
    countyAssocUrl: 'https://www.azcounties.org/members',
    schoolBoardAssocUrl: 'https://azsba.org/member-boards/',
  },
  AR: {
    name: 'Arkansas',
    sheriffAssocUrl: 'https://www.arsheriffs.org/sheriffs',
    courtDirectoryUrl: 'https://www.arcourts.gov/courts/circuit-courts',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  CA: {
    name: 'California',
    sheriffAssocUrl: 'https://www.calsheriffs.org/sheriffs-directory',
    courtDirectoryUrl: 'https://www.courts.ca.gov/superiorcourts.htm',
    countyAssocUrl: 'https://www.counties.org/county-websites',
    schoolBoardAssocUrl: 'https://www.csba.org/GovernanceAndPolicy/DistrictGovernance',
  },
  CO: {
    name: 'Colorado',
    sheriffAssocUrl: 'https://www.coloradosheriffs.org/sheriffs/',
    courtDirectoryUrl: 'https://www.courts.state.co.us/Courts/District/Index.cfm',
    countyAssocUrl: 'https://ccionline.org/member-counties/',
    schoolBoardAssocUrl: null,
  },
  CT: {
    name: 'Connecticut',
    sheriffAssocUrl: null, // CT abolished county government — no county sheriffs
    courtDirectoryUrl: 'https://jud.ct.gov/directory/Superior.htm',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  DE: {
    name: 'Delaware',
    sheriffAssocUrl: null, // 3 counties only — sheriffs on individual county sites
    courtDirectoryUrl: 'https://courts.delaware.gov/superior/judges.aspx',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  FL: {
    name: 'Florida',
    sheriffAssocUrl: 'https://www.flsheriffs.org/sheriffs-offices',
    courtDirectoryUrl: 'https://www.flcourts.gov/Florida-Courts/Circuit-Courts',
    countyAssocUrl: 'https://www.fl-counties.com/membership',
    schoolBoardAssocUrl: 'https://fsba.org/school-districts/',
  },
  GA: {
    name: 'Georgia',
    sheriffAssocUrl: 'https://www.gsanet.org/displaycommon.cfm?an=4',
    courtDirectoryUrl: 'https://georgiacourts.gov/judges/',
    countyAssocUrl: 'https://www.accg.org/county-websites/',
    schoolBoardAssocUrl: 'https://gsba.com/member-services/',
  },
  HI: {
    name: 'Hawaii',
    sheriffAssocUrl: null, // No county sheriffs
    courtDirectoryUrl: 'https://www.courts.state.hi.us/courts/circuit/circuit_courts',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  ID: {
    name: 'Idaho',
    sheriffAssocUrl: 'https://www.idahosheriffs.org/sheriffs',
    courtDirectoryUrl: 'https://isc.idaho.gov/judges',
    countyAssocUrl: 'https://idcounties.org/county-directory/',
    schoolBoardAssocUrl: 'https://www.idsba.org/member-districts/',
  },
  IL: {
    name: 'Illinois',
    sheriffAssocUrl: 'https://www.ilsheriff.org/directory/',
    courtDirectoryUrl: 'https://www.illinoiscourts.gov/courts/circuit-courts/',
    countyAssocUrl: null,
    schoolBoardAssocUrl: 'https://www.iasb.com/about/member-boards/',
  },
  IN: {
    name: 'Indiana',
    sheriffAssocUrl: 'https://www.indianasheriffs.org/directory',
    courtDirectoryUrl: 'https://www.in.gov/courts/circuit/',
    countyAssocUrl: 'https://www.indianacounties.org/member-counties',
    schoolBoardAssocUrl: null,
  },
  IA: {
    name: 'Iowa',
    sheriffAssocUrl: 'https://www.iowasheriffs.com/directory/',
    courtDirectoryUrl: 'https://www.iowacourts.gov/courts-and-judges/judicial-district-directory/',
    countyAssocUrl: 'https://www.iowacounties.org/counties/',
    schoolBoardAssocUrl: null,
  },
  KS: {
    name: 'Kansas',
    sheriffAssocUrl: 'https://www.kansassheriffs.org/membership',
    courtDirectoryUrl: 'https://www.kscourts.org/Courts/District-Courts',
    countyAssocUrl: null,
    schoolBoardAssocUrl: 'https://www.kasb.org/member-districts/',
  },
  KY: {
    name: 'Kentucky',
    sheriffAssocUrl: 'https://www.kysheriffs.org/sheriff-directory',
    courtDirectoryUrl: 'https://courts.ky.gov/courts/circuit/Pages/default.aspx',
    countyAssocUrl: null,
    schoolBoardAssocUrl: 'https://www.ksba.org/',
  },
  LA: {
    name: 'Louisiana',
    sheriffAssocUrl: 'https://www.lsa.cc/about/member-directory/',
    courtDirectoryUrl: 'https://www.lasc.org/About_the_Court/District_Courts',
    countyAssocUrl: null, // Louisiana has parishes
    schoolBoardAssocUrl: 'https://lsba.org/',
  },
  ME: {
    name: 'Maine',
    sheriffAssocUrl: null,
    courtDirectoryUrl: 'https://www.courts.maine.gov/courts/index.shtml',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  MD: {
    name: 'Maryland',
    sheriffAssocUrl: 'https://www.mdsheriffs.com/sheriffs/',
    courtDirectoryUrl: 'https://www.mdcourts.gov/circuitcourt',
    countyAssocUrl: 'https://www.mdcounties.org/member-counties/',
    schoolBoardAssocUrl: 'https://www.mabe.org/school-boards/',
  },
  MA: {
    name: 'Massachusetts',
    sheriffAssocUrl: null, // County government largely abolished
    courtDirectoryUrl: 'https://www.mass.gov/orgs/trial-court',
    countyAssocUrl: null,
    schoolBoardAssocUrl: 'https://www.masc.org/member-districts/',
  },
  MI: {
    name: 'Michigan',
    sheriffAssocUrl: 'https://www.michigansheriff.com/michigan-sheriffs/',
    courtDirectoryUrl: 'https://www.courts.michigan.gov/courts/trial-courts/',
    countyAssocUrl: 'https://www.micounties.org/counties/',
    schoolBoardAssocUrl: 'https://www.masb.org/',
  },
  MN: {
    name: 'Minnesota',
    sheriffAssocUrl: 'https://www.mnsheriffs.org/sheriffs-directory',
    courtDirectoryUrl: 'https://www.mncourts.gov/Find-Courts.aspx',
    countyAssocUrl: 'https://www.mncounties.org/county-contacts/',
    schoolBoardAssocUrl: 'https://www.msba.org/',
  },
  MS: {
    name: 'Mississippi',
    sheriffAssocUrl: 'https://www.mssheriffs.com/directory/',
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  MO: {
    name: 'Missouri',
    sheriffAssocUrl: 'https://www.mosheriffs.com/sheriffs-directory/',
    courtDirectoryUrl: 'https://www.courts.mo.gov/page.jsp?id=233',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  MT: {
    name: 'Montana',
    sheriffAssocUrl: 'https://www.montanasheriffs.org/sheriffs/',
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  NE: {
    name: 'Nebraska',
    sheriffAssocUrl: 'https://www.nesheriffsassoc.org/directory',
    courtDirectoryUrl: null,
    countyAssocUrl: 'https://www.nacone.org/counties',
    schoolBoardAssocUrl: null,
  },
  NV: {
    name: 'Nevada',
    sheriffAssocUrl: null,
    courtDirectoryUrl: 'https://nvcourts.gov/courts/district-courts/',
    countyAssocUrl: 'https://www.nvnaco.org/members/',
    schoolBoardAssocUrl: null,
  },
  NH: {
    name: 'New Hampshire',
    sheriffAssocUrl: null,
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  NJ: {
    name: 'New Jersey',
    sheriffAssocUrl: 'https://www.njsheriffs.org/sheriffs-directory/',
    courtDirectoryUrl: 'https://www.njcourts.gov/courts/vicinages',
    countyAssocUrl: null,
    schoolBoardAssocUrl: 'https://www.njsba.org/',
  },
  NM: {
    name: 'New Mexico',
    sheriffAssocUrl: 'https://www.nmsheriffs.org/sheriffs/',
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  NY: {
    name: 'New York',
    sheriffAssocUrl: 'https://www.nysheriffs.org/sheriffs',
    courtDirectoryUrl: 'https://ww2.nycourts.gov/courts/index.shtml',
    countyAssocUrl: 'https://www.nysac.org/member-counties/',
    schoolBoardAssocUrl: 'https://www.nyssba.org/',
  },
  NC: {
    name: 'North Carolina',
    sheriffAssocUrl: 'https://ncsheriffs.org/sheriffs/',
    courtDirectoryUrl: 'https://www.nccourts.gov/courts',
    countyAssocUrl: 'https://www.ncacc.org/member-counties/',
    schoolBoardAssocUrl: 'https://www.ncsba.org/member-boards/',
  },
  ND: {
    name: 'North Dakota',
    sheriffAssocUrl: 'https://www.ndsheriff.com/county-sheriffs/',
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  OH: {
    name: 'Ohio',
    sheriffAssocUrl: 'https://www.buckeyesheriffs.org/sheriffs/',
    courtDirectoryUrl: 'https://www.supremecourt.ohio.gov/courts/',
    countyAssocUrl: 'https://www.ccao.org/member-counties/',
    schoolBoardAssocUrl: 'https://www.ohsba.org/',
  },
  OK: {
    name: 'Oklahoma',
    sheriffAssocUrl: 'https://www.oksheriffs.org/directory/',
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  OR: {
    name: 'Oregon',
    sheriffAssocUrl: 'https://www.oregonsheriffs.org/sheriffs/',
    courtDirectoryUrl: 'https://www.courts.oregon.gov/courts/Pages/default.aspx',
    countyAssocUrl: 'https://www.oregoncounties.org/county-directory/',
    schoolBoardAssocUrl: 'https://www.osba.org/',
  },
  PA: {
    name: 'Pennsylvania',
    sheriffAssocUrl: 'https://www.pasheriffs.org/member-directory/',
    courtDirectoryUrl: 'https://www.pacourts.us/courts/courts-of-common-pleas',
    countyAssocUrl: 'https://www.pacounties.org/member-counties/',
    schoolBoardAssocUrl: 'https://www.psba.org/member-districts/',
  },
  RI: {
    name: 'Rhode Island',
    sheriffAssocUrl: null,
    courtDirectoryUrl: 'https://www.courts.ri.gov/Courts/SuperiorCourt/Pages/default.aspx',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  SC: {
    name: 'South Carolina',
    sheriffAssocUrl: 'https://www.sheriffsc.org/directory/',
    courtDirectoryUrl: 'https://www.sccourts.org/circuitCourt/',
    countyAssocUrl: 'https://www.sccounties.org/member-counties/',
    schoolBoardAssocUrl: 'https://www.scsba.org/',
  },
  SD: {
    name: 'South Dakota',
    sheriffAssocUrl: 'https://www.sdsheriffs.org/directory/',
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  TN: {
    name: 'Tennessee',
    sheriffAssocUrl: 'https://www.tnsheriffs.com/sheriffs-directory/',
    courtDirectoryUrl: 'https://www.tncourts.gov/courts/trial-courts',
    countyAssocUrl: 'https://www.tncounties.org/county-directory/',
    schoolBoardAssocUrl: null,
  },
  TX: {
    name: 'Texas',
    sheriffAssocUrl: 'https://www.txsheriffs.org/directory/',
    courtDirectoryUrl: 'https://www.txcourts.gov/courts/',
    countyAssocUrl: 'https://www.county.org/member-services/',
    schoolBoardAssocUrl: 'https://www.tasb.org/',
  },
  UT: {
    name: 'Utah',
    sheriffAssocUrl: 'https://www.utahsheriffs.org/sheriffs/',
    courtDirectoryUrl: 'https://www.utcourts.gov/courts/dist/',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  VT: {
    name: 'Vermont',
    sheriffAssocUrl: null,
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  VA: {
    name: 'Virginia',
    sheriffAssocUrl: 'https://vasheriff.org/sheriffs-resources/seniority-list/',
    courtDirectoryUrl: null, // Handled by dedicated VA scraper
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  WA: {
    name: 'Washington',
    sheriffAssocUrl: 'https://www.washeriffs.org/sheriffs-directory/',
    courtDirectoryUrl: 'https://www.courts.wa.gov/court_dir/',
    countyAssocUrl: 'https://www.wsac.org/counties/',
    schoolBoardAssocUrl: 'https://www.wssda.org/',
  },
  WV: {
    name: 'West Virginia',
    sheriffAssocUrl: 'https://www.wvsheriffs.org/sheriffs/',
    courtDirectoryUrl: 'https://www.courtswv.gov/circuit-courts/',
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
  WI: {
    name: 'Wisconsin',
    sheriffAssocUrl: 'https://www.wisheriffs.org/sheriffs/',
    courtDirectoryUrl: 'https://www.wicourts.gov/courts/circuit/index.htm',
    countyAssocUrl: 'https://www.wicounties.org/counties/',
    schoolBoardAssocUrl: 'https://www.wasb.org/',
  },
  WY: {
    name: 'Wyoming',
    sheriffAssocUrl: null,
    courtDirectoryUrl: null,
    countyAssocUrl: null,
    schoolBoardAssocUrl: null,
  },
};
