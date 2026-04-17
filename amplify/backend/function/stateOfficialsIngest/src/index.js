/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * stateOfficialsIngest dispatcher.
 * Runs each state's scrapers in sequence, merges results into Firestore collection `stateOfficials`.
 * Accept event payload { state?: 'VA' } to limit to one state; otherwise runs all registered states.
 */
const { batchedWrite } = require('./common/firestore');
const vaScraper = require('./scrapers/va');
const wikidataNational = require('./scrapers/national/wikidata');
const nationalSheriffs = require('./scrapers/national/sheriffs');
const allStatesEngine = require('./scrapers/national/allStates');
const socrataDiscovery = require('./scrapers/national/socrata'); // v2 — Socrata API discovery

const STATE_SCRAPERS = {
  VA: vaScraper,
  // Future: NY: require('./scrapers/ny'), TX: require('./scrapers/tx'), etc.
};

exports.handler = async (event) => {
  console.log('stateOfficialsIngest invoked:', event?.source || 'manual');
  const onlyState = (event?.state || '').toUpperCase();
  const skipNational = event?.skipNational === true;
  const onlySocrata = event?.onlySocrata === true;  // Run ONLY Socrata discovery (for separate invocation)
  const skipSocrata = event?.skipSocrata === true;   // Skip Socrata (default for combined runs to avoid timeout)
  const summary = { ok: true, national: null, states: {} };

  try {
    // 1) National bulk layers: Wikidata SPARQL + sheriff association directories
    if (!skipNational && !onlyState) {
      summary.national = {};

      // Wikidata (county executives, judges, misc)
      console.log('=== NATIONAL: Wikidata ===');
      try {
        const wdItems = await wikidataNational.scrape();
        if (wdItems.length > 0) {
          const w = await batchedWrite('stateOfficials', wdItems);
          summary.national.wikidata = { fetched: wdItems.length, written: w };
        } else {
          summary.national.wikidata = { fetched: 0, written: 0 };
        }
      } catch (e) {
        console.warn('Wikidata national failed:', e.message);
        summary.national.wikidata = { error: e.message };
      }

      // Socrata-only mode: skip everything else
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

      // Socrata runs FIRST — clean structured data from state APIs (primary source)
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

      // HTML scrapers fill gaps — only adds records Socrata didn't cover (merge:true = won't overwrite Socrata's richer data)
      console.log('=== NATIONAL: All-States Engine (gap-fill) ===');
      try {
        const stateItems = await allStatesEngine.scrape();
        if (stateItems.length > 0) {
          const w = await batchedWrite('stateOfficials', stateItems);
          summary.national.allStates = { fetched: stateItems.length, written: w };
        } else {
          summary.national.allStates = { fetched: 0, written: 0 };
        }
      } catch (e) {
        console.warn('All-states engine failed:', e.message);
        summary.national.allStates = { error: e.message };
      }
    }

    // 2) Per-state deep scrapers (registry-driven, more detailed than Wikidata)
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
