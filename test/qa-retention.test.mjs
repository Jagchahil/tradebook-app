// Tests for lib/qaretention.ts, the qa_candidates dedupe key and the qa_* prune
// plan (doc 96 scale item). Pure, no network. Run: node test/qa-retention.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const Q = await import(`${pathToFileURL(path.resolve(here, '../lib/qaretention.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== qaDedupeKey: stable dedupe key ===\n');
const base = Q.qaDedupeKey('What is the VAT threshold?');
ok('non empty for a real question', base.length > 0);
ok('lowercased', base === base.toLowerCase());
ok('casing does not change the key', Q.qaDedupeKey('WHAT IS THE VAT THRESHOLD?') === base);
ok('trailing question mark does not change the key', Q.qaDedupeKey('What is the VAT threshold') === base);
ok('extra whitespace does not change the key', Q.qaDedupeKey('  What   is the  VAT threshold?  ') === base);
ok('punctuation does not change the key', Q.qaDedupeKey('What is the VAT threshold!!!') === base);
ok('a different question gives a different key', Q.qaDedupeKey('what is the mileage rate') !== base);
ok('empty string gives empty key', Q.qaDedupeKey('') === '');
ok('null is handled', Q.qaDedupeKey(null) === '');
ok('undefined is handled', Q.qaDedupeKey(undefined) === '');
ok('unicode letters survive', Q.qaDedupeKey('Café charge?').includes('café'));
ok('redacted amount token normalises predictably', Q.qaDedupeKey('spent [amount] on tools') === 'spent amount on tools');
ok('key is capped at 500 chars', Q.qaDedupeKey('a '.repeat(600)).length <= 500);

console.log('\n=== retention thresholds ===\n');
ok('terminal window is shorter than the unreviewed backstop', Q.QA_RETENTION.terminalDays < Q.QA_RETENTION.unreviewedDays);
ok('terminal window is 90 days', Q.QA_RETENTION.terminalDays === 90);
ok('unreviewed backstop is 365 days', Q.QA_RETENTION.unreviewedDays === 365);
ok('cache prune window exceeds the 21 day read TTL', Q.QA_CACHE_PRUNE_DAYS > 21);

console.log('\n=== qaPrunePaths: the delete plan ===\n');
const now = new Date('2026-07-08T12:00:00.000Z');
const plan = Q.qaPrunePaths(now);
const enc = (days) => encodeURIComponent(new Date(now.getTime() - days * 86_400_000).toISOString());

ok('returns three delete paths', Array.isArray(plan) && plan.length === 3);
ok('covers both qa tables', plan.some((p) => p.table === 'qa_candidates') && plan.some((p) => p.table === 'qa_cache'));

const terminal = plan[0];
ok('first path targets terminal candidate states', /status=in\.\(dismissed,auto_approved,reviewed\)/.test(terminal.path));
ok('terminal path uses the 90 day cutoff', terminal.path.includes(`created_at=lt.${enc(90)}`));

const unreviewed = plan[1];
ok('second path targets unreviewed candidates', /status=eq\.unreviewed/.test(unreviewed.path));
ok('unreviewed path uses the 365 day cutoff', unreviewed.path.includes(`created_at=lt.${enc(365)}`));

const cache = plan[2];
ok('third path targets qa_cache', cache.table === 'qa_cache' && cache.path.startsWith('qa_cache?'));
ok('cache path uses the 28 day cutoff on updated_at', cache.path.includes(`updated_at=lt.${enc(28)}`));

ok('every path deletes oldest first', plan.every((p) => /order=[a-z_]+\.asc/.test(p.path)));
ok('every path is batch limited', plan.every((p) => /limit=\d+/.test(p.path) && p.maxBatches > 0));
ok('paths are relative (no leading slash or host)', plan.every((p) => !p.path.startsWith('/') && !p.path.includes('://')));
ok('now defaults without throwing', Array.isArray(Q.qaPrunePaths()));
ok('no forbidden dashes anywhere', !/[–—−]/.test(JSON.stringify(plan)));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
