/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * stateOfficialsIngest dispatcher.
 *
 * Data priority (highest → lowest):
 *   1. Per-state deep scrapers (VA) — most detailed, hand-tuned per locality
 *   2. Socrata Discovery — structured API data with locality, contact, office
 *   3. Wikidata / AllStates / national sheriffs — broad but sparse gap-fill
 *
 * Socrata and deep scrapers use batchedWrite (full merge — they win on every field).
 * Everything else uses batchedGapFill (only creates docs that don't already exist).
 */
const { batchedWrite, batchedGapFill } = require('./common/firestore');
const wikidataNational = require('./scrapers/national/wikidata');
const nationalSheriffs = require('./scrapers/national/sheriffs');
const allStatesEngine = require('./scrapers/national/allStates');
const socrataDiscovery = require('./scrapers/national/socrata');

const STATE_SCRAPERS = {
  CA: require('./scrapers/ca'),
  TX: require('./scrapers/tx'),
  FL: require('./scrapers/fl'),
  NY: require('./scrapers/ny'),
  PA: require('./scrapers/pa'),
  IL: require('./scrapers/il'),
  VA: require('./scrapers/va'),
};

exports.handler = async (event) => {
  console.log('stateOfficialsIngest invoked:', event?.source || 'manual');
  const onlyState = (event?.state || '').toUpperCase();
  const skipNational = event?.skipNational === true;
  const onlySocrata = event?.onlySocrata === true;
  const skipSocrata = event?.skipSocrata === true;
  const summary = { ok: true, national: null, states: {} };

  try {
    // ── 1. National layers ──────────────────────────────────────────────
    if (!skipNational && !onlyState) {
      summary.national = {};

      // Socrata-only mode (separate invocation for just Socrata)
      if (onlySocrata) {
        console.log('=== SOCRATA ONLY MODE ===');
        try {
          const socrataItems = await socrataDiscovery.scrape();
          if (socrataItems.length > 0) {
            const w = await batchedWrite('stateOfficials', socrataItems);
            summary.national.socrata = { fetched: socrataItems.length, written: w };
          } else {
            summary.national.socrata = { fetched: 0, written: 0 };
          }
        } catch (e) {
          console.warn('Socrata discovery failed:', e.message);
          summary.national.socrata = { error: e.message };
        }
        return { statusCode: 200, body: JSON.stringify(summary) };
      }

      // ── 1a. Socrata FIRST — primary source, full merge write ──────────
      if (!skipSocrata) {
        console.log('=== NATIONAL: Socrata Discovery (PRIMARY) ===');
        try {
          const socrataItems = await socrataDiscovery.scrape();
          if (socrataItems.length > 0) {
            const w = await batchedWrite('stateOfficials', socrataItems);
            summary.national.socrata = { fetched: socrataItems.length, written: w };
          } else {
            summary.national.socrata = { fetched: 0, written: 0 };
          }
        } catch (e) {
          console.warn('Socrata discovery failed:', e.message);
          summary.national.socrata = { error: e.message };
        }
      }

      // ── 1b. Gap-fill layers — only create docs Socrata didn't cover ───

      console.log('=== NATIONAL: Wikidata (gap-fill) ===');
      try {
        const wdItems = await wikidataNational.scrape();
        if (wdItems.length > 0) {
          const w = await batchedGapFill('stateOfficials', wdItems);
          summary.national.wikidata = { fetched: wdItems.length, written: w };
        } else {
          summary.national.wikidata = { fetched: 0, written: 0 };
        }
      } catch (e) {
        console.warn('Wikidata national failed:', e.message);
        summary.national.wikidata = { error: e.message };
      }

      console.log('=== NATIONAL: All-States Engine (gap-fill) ===');
      try {
        const stateItems = await allStatesEngine.scrape();
        if (stateItems.length > 0) {
          const w = await batchedGapFill('stateOfficials', stateItems);
          summary.national.allStates = { fetched: stateItems.length, written: w };
        } else {
          summary.national.allStates = { fetched: 0, written: 0 };
        }
      } catch (e) {
        console.warn('All-states engine failed:', e.message);
        summary.national.allStates = { error: e.message };
      }
    }

    // ── 2. Per-state deep scrapers — full merge write (highest priority) ─
    const targets = onlyState ? [onlyState].filter((s) => STATE_SCRAPERS[s]) : Object.keys(STATE_SCRAPERS);
    for (const state of targets) {
      console.log(`--- ${state} (deep scraper) ---`);
      const perState = await STATE_SCRAPERS[state].runAll();
      const allItems = [];
      for (const [category, items] of Object.entries(perState)) {
        allItems.push(...items);
        console.log(`  ${category}: ${items.length} officials`);
      }
      const written = await batchedWrite('stateOfficials', allItems);
      summary.states[state] = {
        perCategory: Object.fromEntries(Object.entries(perState).map(([k, v]) => [k, v.length])),
        totalWritten: written,
      };
      console.log(`${state} total written: ${written}`);
    }

    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (err) {
    console.error('stateOfficialsIngest fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message, summary }) };
  }
};
