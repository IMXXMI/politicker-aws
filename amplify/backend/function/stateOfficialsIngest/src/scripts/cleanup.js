#!/usr/bin/env node
/**
 * Cleanup junk data already in Firestore stateOfficials collection.
 * Applies the same cleanName validation to existing docs and deletes those that fail.
 * Also removes docs with known-bad sourceUrls (payroll datasets, complaint reports, etc.).
 *
 * Usage:
 *   node cleanup.js --dry-run          # preview what would be deleted (default)
 *   node cleanup.js --execute          # actually delete
 *   node cleanup.js --state VT         # only clean one state
 */
const { getFirestore, cleanName, admin } = require('../common/firestore');

// Sources that are known to produce junk data
const BAD_SOURCES = [
  'data.vermont.gov',    // VT: state employee payroll, not officials
  'data.ct.gov',         // CT: school district names, not people
];

async function run() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const onlyState = args.includes('--state') ? args[args.indexOf('--state') + 1]?.toUpperCase() : null;

  if (dryRun) console.log('=== DRY RUN (pass --execute to delete) ===\n');

  const db = await getFirestore();
  const col = db.collection('stateOfficials');

  let q = col.select('state', 'category', 'name', 'locality', 'office', 'sourceUrl');
  if (onlyState) q = q.where('state', '==', onlyState);

  console.log('Fetching docs...');
  const snap = await q.get();
  console.log(`Total docs: ${snap.size}`);

  const toDelete = [];
  const reasons = {};

  for (const doc of snap.docs) {
    const d = doc.data();
    let reason = null;

    // 1. Name fails cleanName validation
    const cleaned = cleanName(d.name);
    if (!cleaned) {
      reason = 'bad_name';
    }

    // 2. Name contains comma (likely "LastName,FirstName" from payroll datasets)
    if (!reason && d.name && d.name.includes(',') && !d.name.match(/,\s+(Jr|Sr|II|III|IV)\.?$/i)) {
      reason = 'comma_name';
    }

    // 3. Known bad source
    if (!reason && d.sourceUrl) {
      const domain = d.sourceUrl.replace(/https?:\/\//, '').split('/')[0];
      if (BAD_SOURCES.includes(domain)) {
        reason = `bad_source:${domain}`;
      }
    }

    // 4. Name is actually a place/organization name (school district, county name used as person)
    if (!reason && d.name) {
      if (/\b(school|district|county|city|town|village|center|hospital|nursing|corporation|inc\.|llc)\b/i.test(d.name)) {
        reason = 'org_name';
      }
    }

    // 5. Office field contains junk (complaint dispositions, etc.)
    if (!reason && d.office && d.office.length > 80) {
      reason = 'junk_office';
    }

    if (reason) {
      toDelete.push(doc.ref);
      reasons[reason] = (reasons[reason] || 0) + 1;
      if (toDelete.length <= 20) {
        console.log(`  DELETE [${reason}] ${d.state}/${d.category}: "${d.name}" (${d.office || 'no office'})`);
      }
    }
  }

  console.log(`\nDeletion summary:`);
  for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log(`  TOTAL: ${toDelete.length} / ${snap.size} docs`);

  if (dryRun) {
    console.log('\n(dry run — pass --execute to delete)');
    return;
  }

  // Batch delete
  console.log(`\nDeleting ${toDelete.length} docs...`);
  const BATCH_SIZE = 400;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    console.log(`  deleted ${Math.min(i + BATCH_SIZE, toDelete.length)} / ${toDelete.length}`);
  }
  console.log('Done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
