/**
 * VA sheriffs scraper — seniority list on vasheriff.org has all 123 sheriffs in a single table.
 * Table columns: [#, Jurisdiction, Sheriff Name, Start Date].
 */
const { nameTokens, makeId } = require('../../common/firestore');

const SOURCE_URL = 'https://vasheriff.org/sheriffs-resources/seniority-list/';

async function scrape() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'politicker-scraper/1.0' } });
  if (!res.ok) throw new Error(`vasheriff.org returned ${res.status}`);
  const html = await res.text();

  // Pull all <td>...</td> values, group into 4-cell rows
  const cells = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    cells.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  const items = [];
  for (let i = 0; i + 3 < cells.length; i += 4) {
    const seniority = cells[i];
    const locality = cells[i + 1];
    const sheriffRaw = cells[i + 2];
    const startDate = cells[i + 3];

    // Basic sanity — first cell should be a number, third should start with "Sheriff "
    if (!/^\d+$/.test(seniority) || !/^Sheriff\s/i.test(sheriffRaw)) continue;
    const name = sheriffRaw.replace(/^Sheriff\s+/i, '').trim();
    if (!name || !locality) continue;

    items.push({
      id: makeId('VA', 'sheriff', locality.toLowerCase(), name.toLowerCase()),
      data: {
        category: 'sheriff',
        state: 'VA',
        locality,
        office: 'Sheriff',
        name,
        nameTokens: nameTokens(name),
        party: null,
        tookOffice: startDate || null,
        termEnds: null,
        contact: {},
        photo: null,
        sourceUrl: SOURCE_URL,
        castsVotes: false,
        voteRecordsUrl: null,
        seniorityNumber: parseInt(seniority, 10) || null,
      },
    });
  }

  console.log(`VA sheriffs parsed: ${items.length}`);
  return items;
}

module.exports = { scrape };
