/**
 * TX state judges via CourtListener (free, CORS-friendly, reliable).
 * Pulls all currently-serving judges in TX state courts:
 *   - Supreme Court of Texas (court id: tex)
 *   - TX Court of Criminal Appeals (court id: texcrimapp)
 */
const { nameTokens, makeId, cleanName } = require('../../common/firestore');

const TX_STATE_COURT_IDS = [
  'tex',         // Supreme Court of Texas
  'texcrimapp',  // TX Court of Criminal Appeals
];

const COURT_LABELS = {
  tex: 'Supreme Court of Texas',
  texcrimapp: 'Texas Court of Criminal Appeals',
};

async function scrape() {
  const items = [];
  const seen = new Set();

  for (const courtId of TX_STATE_COURT_IDS) {
    try {
      const url = `https://www.courtlistener.com/api/rest/v4/positions/?court__id=${courtId}&page_size=100`;
      const res = await fetch(url, { headers: { 'User-Agent': 'politicker-scraper/1.0' } });
      if (!res.ok) {
        console.warn(`CourtListener ${courtId}: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const positions = (data.results || []).filter((p) => !p.date_termination);

      for (const pos of positions) {
        let person = null;
        if (typeof pos.person === 'string' && pos.person) {
          try {
            const pr = await fetch(pos.person.startsWith('http') ? pos.person : `https://www.courtlistener.com/api/rest/v4/people/${pos.person}/`);
            if (pr.ok) person = await pr.json();
          } catch { continue; }
        } else if (pos.person && typeof pos.person === 'object') {
          person = pos.person;
        }
        if (!person) continue;

        const rawName = [person.name_first, person.name_middle, person.name_last].filter(Boolean).join(' ').trim();
        const fullName = cleanName(rawName);
        if (!fullName) continue;
        const key = `${courtId}-${person.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          id: makeId('TX', 'state-judge', courtId, fullName.toLowerCase()),
          data: {
            category: 'state-judge',
            state: 'TX',
            locality: null,
            localityLower: null,
            office: COURT_LABELS[courtId] || `Court: ${courtId}`,
            name: fullName,
            nameTokens: nameTokens(fullName),
            party: null,
            tookOffice: pos.date_start || null,
            termEnds: null,
            contact: {
              website: person.absolute_url ? `https://www.courtlistener.com${person.absolute_url}` : '',
            },
            photo: null,
            sourceUrl: `https://www.courtlistener.com${person.absolute_url || ''}`,
            castsVotes: true,
            voteRecordsUrl: `https://www.courtlistener.com/opinion/?type=o&court=${courtId}`,
            courtListenerPersonId: person.id,
            courtId,
          },
        });
      }
      console.log(`TX court ${courtId}: ${positions.length} positions, ${items.length} total so far`);
    } catch (e) {
      console.warn(`TX judges ${courtId} error:`, e.message);
    }
  }

  console.log(`TX state judges total: ${items.length}`);
  return items;
}

module.exports = { scrape };
