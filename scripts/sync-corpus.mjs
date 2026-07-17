// Sync the ONE claim corpus from web (canonical) to the mobile app.
//
//   node scripts/sync-corpus.mjs
//
// The corpus lives in lib/claimrules.data.ts and must be byte-identical in both repos. A human edits
// the web copy; this copies it to the sibling mobile repo. test/taxrules-parity.test.mjs then fails
// the build if they ever differ, so this cannot be forgotten silently.
//
// Run it from the web repo root, with the mobile app checked out as a sibling (../tradebook-app),
// exactly the layout CI and the local dev machine both use.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../lib/claimrules.data.ts');
const dst = path.resolve(here, '../../tradebook-app/lib/claimrules.data.ts');

if (!existsSync(src)) {
  console.error(`Canonical corpus not found at ${src}`);
  process.exit(1);
}
if (!existsSync(path.dirname(dst))) {
  console.error(`Mobile lib/ not found at ${path.dirname(dst)}. Check out the app as a sibling (../tradebook-app).`);
  process.exit(1);
}

const data = readFileSync(src);
const before = existsSync(dst) ? readFileSync(dst) : null;
if (before && before.equals(data)) {
  console.log('Corpus already in sync. Nothing to do.');
  process.exit(0);
}
writeFileSync(dst, data);
console.log(`Synced corpus -> ${dst}  (${data.length} bytes)`);
console.log('Now commit BOTH repos. The parity test will confirm they match.');
