/**
 * Top-10 Virginia localities by population — registry for Board of Supervisors / City Council
 * and School Board member pages. Each entry carries source URLs + extraction hints.
 *
 * `verified: false` means we haven't confirmed the URL structure yet at build time; the scraper
 * logs each URL's status so it's easy to see what's broken and fix the URL here.
 *
 * Adding new localities = add an entry to this array. No code changes needed.
 */

module.exports = [
  {
    locality: 'Fairfax County',
    kind: 'county',
    bosUrl: 'https://www.fairfaxcounty.gov/boardofsupervisors/board-of-supervisors',
    schoolBoardUrl: 'https://www.fcps.edu/about-fcps/school-board',
    cms: 'civicplus',   // Fairfax uses a CivicPlus variant
  },
  {
    locality: 'Virginia Beach',
    kind: 'city',
    bosUrl: 'https://www.virginiabeach.gov/government/city-council',
    schoolBoardUrl: 'https://www.vbschools.com/about-us/school-board',
    cms: 'custom',
  },
  {
    locality: 'Prince William County',
    kind: 'county',
    bosUrl: 'https://www.pwcva.gov/department/board-county-supervisors',
    schoolBoardUrl: 'https://www.pwcs.edu/about_us/school_board',
    cms: 'custom',
  },
  {
    locality: 'Loudoun County',
    kind: 'county',
    bosUrl: 'https://www.loudoun.gov/248/Board-of-Supervisors',
    schoolBoardUrl: 'https://www.lcps.org/Page/120',
    cms: 'civicplus',
  },
  {
    locality: 'Chesterfield County',
    kind: 'county',
    bosUrl: 'https://www.chesterfield.gov/180/Board-of-Supervisors',
    schoolBoardUrl: 'https://mychesterfieldschools.com/our-district/leadership/school-board/',
    cms: 'civicplus',
  },
  {
    locality: 'Henrico County',
    kind: 'county',
    bosUrl: 'https://henrico.gov/government/board-of-supervisors/',
    schoolBoardUrl: 'https://henricoschools.us/school-board/',
    cms: 'wordpress',
  },
  {
    locality: 'Arlington County',
    kind: 'county',
    bosUrl: 'https://www.arlingtonva.us/Government/County-Board',
    schoolBoardUrl: 'https://www.apsva.us/school-board/',
    cms: 'opencities',
  },
  {
    locality: 'Chesapeake',
    kind: 'city',
    bosUrl: 'https://www.cityofchesapeake.net/government/city-council/members.htm',
    schoolBoardUrl: 'https://cpschools.com/about-us/school-board/',
    cms: 'custom',
  },
  {
    locality: 'Norfolk',
    kind: 'city',
    bosUrl: 'https://www.norfolk.gov/397/City-Council',
    schoolBoardUrl: 'https://www.npsk12.com/Page/55',
    cms: 'civicplus',
  },
  {
    locality: 'Richmond',
    kind: 'city',
    bosUrl: 'https://www.rva.gov/city-council',
    schoolBoardUrl: 'https://www.rvaschools.net/our-district/school-board',
    cms: 'wordpress',
  },
];
