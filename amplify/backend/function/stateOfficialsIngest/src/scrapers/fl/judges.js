/**
 * FL state judges via CourtListener (free, CORS-friendly, reliable).
 * Pulls all currently-serving judges in FL state courts:
 *   - Supreme Court of Florida (court id: fla)
 *   - FL District Courts of Appeal (court id: fladistctapp)
 */
const { nameTokens, makeId, cleanName } = require('../../common/firestore');

const FL_STATE_COURT_IDS = [
  'fla',            // Supreme Court of Florida
  'fladistctapp',   // FL District Courts of Appeal
];

const COURT_LABELS = {
  fla: 'Supreme Court of Florida',
  fladistctapp: 'FL District Courts of Appeal',
};

async function scrape() {
  const items = [];
  const seen = new Set();

  for (const courtId of FL_STATE_COURT_IDS) {
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
          id: makeId('FL', 'state-judge', courtId, fullName.toLowerCase()),
          data: {
            category: 'state-judge',
            state: 'FL',
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
      console.log(`FL court ${courtId}: ${positions.length} positions, ${items.length} total so far`);
    } catch (e) {
      console.warn(`FL judges ${courtId} error:`, e.message);
    }
  }

  console.log(`FL state judges total: ${items.length}`);
  return items;
}

module.exports = { scrape };
