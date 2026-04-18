/**
 * Texas orchestrator. Runs each TX-specific scraper and returns a map:
 *   { 'state-judge': [...], sheriff: [...], 'school-board': [...], 'county-board': [...] }
 * Each scraper returns items shaped as { id, data } ready for batchedWrite.
 */
const judges = require('./judges');
const sheriffs = require('./sheriffs');
const schoolBoards = require('./schoolBoards');
const countyBoards = require('./countyBoards');

async function runAll() {
  const out = {};
  const registry = [
    ['state-judge', judges],
    ['sheriff', sheriffs],
    ['school-board', schoolBoards],
    ['county-board', countyBoards],
  ];
  for (const [category, mod] of registry) {
    try {
      out[category] = await mod.scrape();
    } catch (e) {
      console.warn(`TX ${category} scraper failed:`, e.message);
      out[category] = [];
    }
  }
  return out;
}

module.exports = { runAll };
