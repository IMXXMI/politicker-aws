/**
 * VA state judges via CourtListener (free, CORS-friendly, reliable).
 * Pulls all currently-serving judges in VA state courts:
 *   - Supreme Court of Virginia (court id: va)
 *   - Court of Appeals of Virginia (court id: vactapp)
 *   - VA state trial courts tracked by CourtListener
 */
const { nameTokens, makeId } = require('../../common/firestore');

const VA_STATE_COURT_IDS = [
  'va',       // Supreme Court of Virginia
  'vactapp',  // Court of Appeals of Virginia
  // Circuit / district courts (add as CourtListener expands coverage)
];

const COURT_LABELS = {
  va: 'Supreme Court of Virginia',
  vactapp: 'Court of Appeals of Virginia',
};

async function scrape() {
  const items = [];
  const seen = new Set();

  for (const courtId of VA_STATE_COURT_IDS) {
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

        const fullName = [person.name_first, person.name_middle, person.name_last].filter(Boolean).join(' ').trim();
        if (!fullName) continue;
        const key = `${courtId}-${person.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          id: makeId('VA', 'state-judge', courtId, fullName.toLowerCase()),
          data: {
            category: 'state-judge',
            state: 'VA',
            locality: null,
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
            castsVotes: true,                    // judges cast rulings (treated as votes for UI)
            voteRecordsUrl: `https://www.courtlistener.com/opinion/?type=o&court=${courtId}`,
            courtListenerPersonId: person.id,
            courtId,
          },
        });
      }
      console.log(`VA court ${courtId}: ${positions.length} positions, ${items.length} total so far`);
    } catch (e) {
      console.warn(`VA judges ${courtId} error:`, e.message);
    }
  }

  console.log(`VA state judges total: ${items.length}`);
  return items;
}

module.exports = { scrape };
