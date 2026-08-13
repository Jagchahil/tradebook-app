// R2-F11. THE FEED SAID "FILED" AND STAMPED IT WITH THE MOMENT THE ROW ARRIVED, AND WENT ON
// SAYING "WAITING FOR YOUR YES" ABOUT ROWS HE HAD ALREADY ANSWERED.
// Run with: node test/decidedat.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Two faults in one rendering, and they pull in opposite directions, which is why no single
// timestamp could ever have been true:
//
//   1. Every sentence was stamped created_at. Right for "Logged PORTERS" (arriving IS what
//      happened) and wrong for "Filed PORTERS as stock" (which happened when he pressed). A florist
//      who imported at 15:04 and answered her pile at 17:00 read a feed saying she had filed things
//      an hour before she opened the screen.
//   2. Marking a row "not business" sets is_personal and never sets confirmed, so it fell into the
//      unconfirmed branch and the feed kept telling her it was "waiting for your yes" about
//      something she had answered.
//
// The decision taken, and approved: the feed is a LOG. It records what happened and when it
// happened. So the time follows the verb, and a decided row is never described as waiting.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };

const supa = read('lib/supabase.ts');
const mig = read('supabase/APPLY_2026-08-13_decided_at.sql');
const orig = read('supabase/review_pile.sql');
const prop = read('supabase/APPLY_2026-08-13_property_expense_stream.sql');

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('A. 🔴 The migration restates two functions, and must not have lost a guard');
// ════════════════════════════════════════════════════════════════════════════════════════
//
// The first draft of this migration retyped confirm_pile from memory and silently dropped its
// empty-category guard. Without it a bulk confirm with no category files every row in the group
// under nothing at all: a DISPLAY fix would have removed a MONEY guard. These assertions exist
// because that happened, and they compare the copy against the original rather than against a list
// somebody has to remember to update.

function body(src, name) {
  const i = src.indexOf(`create or replace function public.${name}(`);
  if (i < 0) return '';
  const j = src.indexOf(`grant execute on function public.${name}`, i);
  return j < 0 ? '' : src.slice(i, j);
}
// Every non-blank, non-comment line of the original must appear in the migration's copy.
function guardsKept(originalSrc, migrationSrc, name) {
  const a = body(originalSrc, name), b = body(migrationSrc, name);
  if (!a || !b) return { okAll: false, missing: ['<body not found>'] };
  const lines = a.split('\n').map((l) => l.replace(/--.*$/, '').trim()).filter(Boolean)
    // the confirmed=true line legitimately gains a trailing comma
    .map((l) => l.replace(/confirmed\s*=\s*true;?$/, 'confirmed = true'));
  const flat = b.replace(/--.*$/gm, '').replace(/\s+/g, ' ');
  const missing = lines.filter((l) => !flat.includes(l.replace(/\s+/g, ' ')));
  return { okAll: missing.length === 0, missing };
}
{
  const r = guardsKept(orig, mig, 'confirm_pile');
  ok('🔴 confirm_pile keeps every line of its original body', r.okAll);
  if (!r.okAll) console.error('     missing:', r.missing);
  // Named explicitly as well, because this is the one that was actually lost.
  ok('🔴 including the empty category guard that a display fix nearly deleted',
    /length\(p_category\) > 40/.test(body(mig, 'confirm_pile')));
  ok('and money out only', /t\.amount < 0/.test(body(mig, 'confirm_pile')));
  ok('and never a flagged row', /t\.looks_personal = false/.test(body(mig, 'confirm_pile')));
  ok('and never anyone else\'s rows', /t\.user_id = p_user/.test(body(mig, 'confirm_pile')));
}
{
  const r = guardsKept(prop, mig, 'confirm_pile_property');
  ok('🔴 confirm_pile_property keeps every line of its original body', r.okAll);
  if (!r.okAll) console.error('     missing:', r.missing);
  ok('including the four category allowlist',
    /'mortgage interest', 'letting agent', 'property repairs', 'ground rent'/.test(body(mig, 'confirm_pile_property')));
}
{
  // And the ONE thing that should be different is there, in both.
  ok('confirm_pile stamps the decision', /decided_at = now\(\)/.test(body(mig, 'confirm_pile')));
  ok('confirm_pile_property stamps it too', /decided_at = now\(\)/.test(body(mig, 'confirm_pile_property')));
  ok('the column is added, and nullable', /add column if not exists decided_at timestamptz;/.test(mig));
  ok('🔴 and nothing is backfilled', !/update public\.transactions[\s\S]{0,200}set decided_at = created_at/.test(mig));
  ok('the migration does NOT restate confirm_income', !/create or replace function public\.confirm_income/.test(mig));
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('B. The application stamps the two decisions the RPCs do not');
// ════════════════════════════════════════════════════════════════════════════════════════

ok('🔴 "not business" is a dated decision now', /is_personal: true, decided_at: new Date\(\)\.toISOString\(\)/.test(supa));
ok('the feed reads the column', /created_at,decided_at,transaction_date/.test(supa));
ok('and the row type declares it', /decided_at\?: string \| null;/.test(supa));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('C. 🔴 The time follows the verb');
// ════════════════════════════════════════════════════════════════════════════════════════

const fnAt = supa.indexOf('function feedTxItem');
const feed = supa.slice(fnAt, supa.indexOf('\n}', supa.indexOf('detail: `${money} out.`', fnAt)));
// ⚠️ THE EXPRESSION, NOT THE DECLARATION. `const decided = ''` keeps the name and reads nothing,
// which is the finding walking back in with the guard still green. The sabotage pass caught it.
ok('the arrival is read from created_at',
  /const arrived = typeof r\.created_at === 'string' \? r\.created_at : '';/.test(feed));
ok('🔴 and the decision is actually read from decided_at',
  /const decided = typeof r\.decided_at === 'string' && r\.decided_at \? r\.decided_at : '';/.test(feed));

// ⚠️ COUNTED, not merely present. The three FILED branches must each prefer the decision time, and
// the two WAITING branches must not, because for them arriving is the only moment there is.
ok('🔴 every filed branch prefers the decision time', (feed.match(/when: decided \|\| when/g) ?? []).length === 3);
ok('🔴 and the waiting branches still use arrival', (feed.match(/waiting for your yes/g) ?? []).length === 2);
// ⚠️ SLICED TO THE UNCONFIRMED BLOCK. A window-based regex ran past the closing brace into the
// next branch and matched its `decided ||`, so it failed on correct code. Take the block itself.
const unconfAt = feed.indexOf('if (r.confirmed !== true) {');
const unconfBlock = feed.slice(unconfAt, feed.indexOf('\n  }', unconfAt));
ok('the unconfirmed block exists', unconfBlock.length > 0);
ok('🔴 and it never reaches for a decision time it does not have', !/decided/.test(unconfBlock));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('D. 🔴 A decided row is never called waiting');
// ════════════════════════════════════════════════════════════════════════════════════════

const personalAt = feed.indexOf('r.is_personal === true');
const confirmedAt = feed.indexOf('r.confirmed !== true');
ok('the personal check exists', personalAt > 0);
ok('the confirmed check exists', confirmedAt > 0);
ok('🔴 personal is tested BEFORE unconfirmed, which is the whole fix', personalAt < confirmedAt);
ok('and a personal row reads as set aside, not as waiting', /Set aside \$\{name\} as personal\./.test(feed));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
