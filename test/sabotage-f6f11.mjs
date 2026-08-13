// SABOTAGE F6 (the person payee) AND F11 (the feed as a log).
//
//   node test/sabotage-f6f11.mjs

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-f6f11-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return dir;
}
function runSuites(dir) {
  for (const t of ['test/personpayee.test.mjs', 'test/decidedat.test.mjs']) {
    try {
      const out = execFileSync('node', [path.join(dir, t)], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (/[1-9]\d* failed\./.test(out)) return true;
    } catch { return true; }
  }
  return false;
}
const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const SABOTAGES = [
  // ── F6: the rule comes back ──────────────────────────────────────────────────────────────
  {
    name: '🔴 a rule is learned about a person again, which is the finding itself',
    apply: (d) => edit(d, 'app/api/pile/route.ts',
      'if (item.key && !item.personLike) await learnVendor(', 'if (item.key) await learnVendor('),
  },
  {
    name: 'the plan stops carrying the flag, so the caller cannot decide',
    apply: (d) => edit(d, 'lib/reviewpile.ts', '    personLike: g.personLike,', '    personLike: false,'),
  },
  {
    name: 'the group stops asking who the payee is',
    apply: (d) => edit(d, 'lib/reviewpile.ts', 'const person = looksLikePerson(vendor);', 'const person = false;'),
  },
  {
    name: 'nobody is a person any more',
    apply: (d) => edit(d, 'lib/personal.ts', '  if (PERSON_TITLES.has(words[0])) return true;', ''),
  },
  {
    name: '🔴 EVERYBODY is a person, so no shop ever teaches a rule again',
    apply: (d) => edit(d, 'lib/personal.ts',
      '  if (words.some((w) => COMPANY_WORDS.has(w))) return false;', ''),
  },
  {
    name: 'a surname of any length counts, so "B AND Q" reads as a person',
    apply: (d) => edit(d, 'lib/personal.ts', '  const NAME_MIN = 4;', '  const NAME_MIN = 1;'),
  },
  {
    name: 'a reference number stops disqualifying a name',
    apply: (d) => edit(d, 'lib/personal.ts', '  if (/\\d/.test(v)) return false;', ''),
  },
  {
    name: '🔴 the press stops filing, which would be a cure worse than the disease',
    apply: (d) => edit(d, 'app/api/pile/route.ts',
      '      applied += await confirmPile(user.id, item.ids, item.category);',
      '      if (!item.personLike) applied += await confirmPile(user.id, item.ids, item.category);'),
  },
  {
    name: '🔴 the vendor KEY is changed, orphaning every rule ever taught',
    apply: (d) => edit(d, 'lib/memory.ts', "  return words.slice(0, 2).join(' ');", "  return words.slice(0, 3).join(' ');"),
  },
  {
    name: 'the screen promises a rule it no longer keeps',
    apply: (d) => edit(d, 'app/app/pile/page.tsx',
      "              {groups.some((g) => !g.personLike)\n                ? 'Answer once for a shop and we will file every future payment there the same way, without asking again.'\n                : 'Answer once and we will file the lot.'}",
      "              Answer once for a shop and we will file every future payment there the same way, without asking again."),
  },
  // ── F11: the feed stops being a log ──────────────────────────────────────────────────────
  {
    name: '🔴 "Filed" is stamped with the arrival time again',
    apply: (d) => edit(d, 'lib/supabase.ts', 'when: decided || when,', 'when,'),
  },
  {
    name: 'the decision time is never read',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "  const decided = typeof r.decided_at === 'string' && r.decided_at ? r.decided_at : '';",
      "  const decided = '';"),
  },
  {
    name: 'the feed stops selecting the column',
    apply: (d) => edit(d, 'lib/supabase.ts', 'created_at,decided_at,transaction_date', 'created_at,transaction_date'),
  },
  {
    name: '🔴 "not business" goes back to reading as waiting for your yes',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "  if (r.is_personal === true) {\n    return {\n      kind: 'filed',\n      when: decided || when,\n      title: `Set aside ${name} as personal.`,",
      "  if (false) {\n    return {\n      kind: 'filed',\n      when: decided || when,\n      title: `Set aside ${name} as personal.`,"),
  },
  {
    name: 'the personal decision stops being dated',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'JSON.stringify({ is_personal: true, decided_at: new Date().toISOString() })',
      'JSON.stringify({ is_personal: true })'),
  },
  // ── 🔴 The migration's guards. This is the one that nearly shipped. ─────────────────────
  {
    name: '🔴 the migration loses the empty category guard, exactly as the first draft did',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_decided_at.sql',
      "  if p_category is null or length(trim(p_category)) = 0 or length(p_category) > 40 then\n    return 0;\n  end if;", ''),
  },
  {
    name: '🔴 the migration loses money out only',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_decided_at.sql',
      '     and t.amount < 0                -- MONEY OUT ONLY. A credit is never bulk confirmed.', ''),
  },
  {
    name: 'the migration loses the looks_personal guard',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_decided_at.sql',
      '     and t.looks_personal = false    -- and nothing that smells of a benefit. Ever.', ''),
  },
  {
    name: 'the migration loses the four category allowlist',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_decided_at.sql',
      "  if v_cat not in ('mortgage interest', 'letting agent', 'property repairs', 'ground rent') then\n    return 0;\n  end if;", ''),
  },
  {
    name: 'the migration stops stamping at all',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_decided_at.sql', '         decided_at = now()   -- R2-F11\n', ''),
  },
  {
    name: '🔴 somebody backfills a decision time nobody observed',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_decided_at.sql',
      'alter table public.transactions\n  add column if not exists decided_at timestamptz;',
      'alter table public.transactions\n  add column if not exists decided_at timestamptz;\nupdate public.transactions set decided_at = created_at where confirmed = true;'),
  },
];

const CONTROLS = [
  {
    name: 'a comment is reworded in personal.ts',
    apply: (d) => edit(d, 'lib/personal.ts', '// Titles that only ever precede a person.',
      '// Titles that only ever precede a person (comment touched).'),
  },
  {
    name: 'a new company word is added, which is the list doing its job',
    apply: (d) => edit(d, 'lib/personal.ts', "  'solutions', 'systems',", "  'solutions', 'systems', 'plumbing',"),
  },
  {
    name: 'whitespace in the feed builder',
    apply: (d) => edit(d, 'lib/supabase.ts', '  const arrived = ', '\n  const arrived = '),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const dir = scratch();
  try { s.apply(dir); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  if (runSuites(dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const dir = scratch();
  try { c.apply(dir); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  if (runSuites(dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${cOk}/${CONTROLS.length} controls green.`);
console.log(`${caught + cOk} of ${SABOTAGES.length + CONTROLS.length}.`);
if (missed > 0 || cBad > 0) process.exit(1);
