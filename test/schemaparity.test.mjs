// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE SCHEMA PARITY RATCHET.
//   node test/schemaparity.test.mjs
//
// THE REPO'S SQL IS SUPPOSED TO BE A COMPLETE DESCRIPTION OF THE DATABASE THIS PRODUCT SERVES.
// On 16 August 2026 it was not, in three separate directions, and nothing in the product would ever
// have said so. Production was correct in all three cases. The REPO was wrong, which is worse in the
// one way that matters: the live database is the only copy of the truth, and nobody can rebuild it.
//
//   1. public.khoji_documents has row level security ON in production and NOTHING IN THIS REPO
//      TURNS IT ON. Somebody enabled it by hand and never wrote it down. Every other one of the
//      seventy one tables this repo creates carries its own enable statement. A database rebuilt
//      from this repo, a staging environment, or a restore, comes up with that table unprotected,
//      and it is the table the tax law amendment watcher reads.
//
//      ⚠️ AND THE REASON NOBODY LOOKED IS A SENTENCE. APPLY_2026-07-15_khoji_law.sql said
//      "Same posture as khoji_documents (proven in the 14 Jul audit): RLS on". That is TRUE of
//      production and FALSE of this repo, and it was written by somebody who had just checked the
//      live database. A claim proved against production and then written down as a claim about the
//      code is the exact shape this suite exists to catch.
//
//   2. khoji_runs and khoji_history are live, and are created by NO SQL ANYWHERE IN THIS REPO.
//      khoji_runs is read or written by twenty source files.
//
//   3. studio_agent_runs is created by APPLY_2026-07-15_studio_agent.sql, does not exist in
//      production, and is referenced by zero source files. A migration for a table nobody has.
//
// ⚠️ AND THE SQL LIVES IN THREE DIRECTORIES, NOT ONE. supabase/, khoji/ AND docs/. Two independent
// audits and the first scan of this run all read supabase/ and khoji/ only, and all three therefore
// reported eight tables as missing that are sitting in docs/. That is why SQL_DIRS is a list and why
// a new directory of migrations has to be added here before its tables count as described.
//
// ⚠️ THIS SUITE IS WRITTEN AS THE SHAPE, NOT AS THE THREE INSTANCES. It does not know the names
// khoji_documents or studio_agent_runs. It derives three sets from disk and compares them, so the
// FOURTH instance fails here on the day it is written rather than in thirteen months.
//
// It reads source and never imports it, so a deleted file is a readable red line and not a module
// resolution stack trace.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const missing = (want, got) => want.filter((x) => !got.includes(x));
const read = (rel) => { try { return readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };
// ⚠️ COMMENTS ARE NOT CODE, AND A SCANNER THAT FORGETS IT INVENTS TABLES. lib/messagecost.ts:42
// carries a commented out `create table public.wa_outbound (` as a proposal. The first version of
// this suite read it as a live caller and demanded a migration for a table nobody has ever had.
// Same helper as test/scotland.test.mjs, and for the same reason.
const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
// SQL comments run to the end of the line and start with two dashes. Section 4 reads them on
// purpose, so it takes the raw text; everything else takes this.
const sqlCodeOnly = (t) => t.replace(/^\s*--[^\n]*$/gm, '');

// Every directory that may hold schema. A new one must be added here on purpose.
const SQL_DIRS = ['supabase', 'khoji', 'docs'];
const CODE_DIRS = ['app', 'lib', 'khoji', 'scripts'];
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.vercel', '.expo', 'dist', 'build', 'out',
  '_to_delete', '_to_delete_scratch',
]);

function walk(dir, exts, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e) || e.startsWith('.fuse_hidden')) continue;
    const p = path.join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.test(e)) out.push(path.relative(root, p).split(path.sep).join('/'));
  }
  return out;
}

const sqlFiles = SQL_DIRS.flatMap((d) => walk(path.join(root, d), /\.sql$/));
const codeFiles = CODE_DIRS.flatMap((d) => walk(path.join(root, d), /\.(ts|tsx|mjs|js)$/));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE THREE SETS, ALL DERIVED FROM DISK.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// CREATED. The trailing open bracket is required on purpose: without it, the words "create table"
// inside an ordinary English sentence in a comment mint a table called "silently".
const CREATED = new Set();
const CREATED_IN = new Map();
for (const rel of sqlFiles) {
  const src = sqlCodeOnly(read(rel));
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const t = m[1].toLowerCase();
    CREATED.add(t);
    if (!CREATED_IN.has(t)) CREATED_IN.set(t, rel);
  }
}

// PROTECTED. Row level security turned on, by this repo, in writing.
const PROTECTED = new Set();
for (const rel of sqlFiles) {
  const re = /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi;
  let m;
  const src = sqlCodeOnly(read(rel));
  while ((m = re.exec(src)) !== null) PROTECTED.add(m[1].toLowerCase());
}

// ADDRESSED. Every table this product actually talks to, derived from disk rather than from a list
// somebody maintains. FOUR mechanisms, because this product reaches its tables four ways and a
// scanner that knows only the first reports eight live tables as dead:
//
//   1. A PostgREST path written whole:            `${url}/rest/v1/transactions?...`
//   2. A PostgREST query composed from a prefix:  `qa_candidates?status=in.(...)`
//   3. Direct Postgres from the Khoji jobs:       db.query('... from public.khoji_bodies ...')
//   4. Reached only through a SQL function:       rate_hits, written by the rate_hit RPC
//
// Mechanism 4 is read out of the function BODIES in this repo's own SQL, so a table that only ever
// moves through an RPC still counts as used, and still has to exist.
const ADDRESSED = new Set();
const ADDRESSED_IN = new Map();
const noteAddressed = (t, rel) => {
  const name = t.toLowerCase();
  if (name === 'rpc') return;
  ADDRESSED.add(name);
  if (!ADDRESSED_IN.has(name)) ADDRESSED_IN.set(name, rel);
};

for (const rel of codeFiles) {
  const src = codeOnly(read(rel));
  let m;
  const restPath = /\/rest\/v1\/([a-z_][a-z0-9_]*)/gi;
  while ((m = restPath.exec(src)) !== null) noteAddressed(m[1], rel);
  // A query string opening a template literal, which is how the composed callers are written.
  const composed = /[`'"]([a-z_][a-z0-9_]{3,})\?(?:select|id|user_id|status|url|created_at|bucket|phone|expires_at)=/gi;
  while ((m = composed.exec(src)) !== null) noteAddressed(m[1], rel);
  // Direct SQL from the Khoji jobs and the scripts.
  const direct = /\bpublic\.([a-z_][a-z0-9_]*)/gi;
  while ((m = direct.exec(src)) !== null) noteAddressed(m[1], rel);
}

// Mechanism 4. Anything a SQL function in this repo touches is reachable through that function.
for (const rel of sqlFiles) {
  const src = sqlCodeOnly(read(rel));
  const fn = /create\s+(?:or\s+replace\s+)?function[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
  let f;
  while ((f = fn.exec(src)) !== null) {
    const body = f[1];
    const re = /\bpublic\.([a-z_][a-z0-9_]*)/gi;
    let m;
    while ((m = re.exec(body)) !== null) noteAddressed(m[1], `${rel} (function body)`);
  }
}

const created = [...CREATED].sort();
const addressed = [...ADDRESSED].sort();

console.log(`\n  ${sqlFiles.length} SQL files, ${created.length} tables created, ${PROTECTED.size} with row level security, ${addressed.length} addressed by code\n`);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. EVERY TABLE THIS REPO CREATES TURNS ROW LEVEL SECURITY ON, IN THIS REPO.
//
// Not "is protected in production". Production cannot be read from here and a claim proved against
// production is exactly what went wrong. The question this asks is the one a rebuild asks.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. every created table enables row level security, in writing, here ===\n');

// A table may sit out ONLY with a reason somebody can read. There are none today, and the empty
// object is the point: the first person to add one has to type the reason.
const RLS_NOT_REQUIRED = {};

for (const t of created) {
  if (t in RLS_NOT_REQUIRED) continue;
  ok(`🔴 ${t} enables row level security (created in ${CREATED_IN.get(t)})`, PROTECTED.has(t));
}
ok('and every row level security exemption carries a reason somebody can read',
  Object.values(RLS_NOT_REQUIRED).every((why) => typeof why === 'string' && why.length > 40));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. EVERY TABLE THE CODE TALKS TO IS CREATED BY THIS REPO.
//
// A table that exists only in the live database is a table nobody reviews, nobody can rebuild and
// nobody can find the row level security posture of. If one must stay that way it is named here
// with the reason, so the next person is aware of the question even when they cannot fix it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. every table the code addresses is created by SQL in this repo ===\n');

const LIVE_ONLY = {
  khoji_runs:
    'Created outside this repo before khoji/schema.sql existed, and khoji/schema.sql:70 records that its writer "is not in this repo" and the grant "was already granted in the live database". Twenty source files read or write it. Live catalogue on 16 August 2026 confirms row level security is ON. It needs a create statement written back into khoji/schema.sql from the live definition before anybody has to rebuild.',
  khoji_history:
    'Same origin and same gap as khoji_runs, three source files. Live catalogue on 16 August 2026 confirms row level security is ON. Same remedy.',
};

for (const t of addressed) {
  if (t in LIVE_ONLY) continue;
  ok(`🔴 ${t} has a create statement (addressed in ${ADDRESSED_IN.get(t)})`, CREATED.has(t));
}
ok('and every live only table carries a reason somebody can read',
  Object.values(LIVE_ONLY).every((why) => typeof why === 'string' && why.length > 40));
ok('and no live only entry has quietly gained a create statement, which would mean deleting it here',
  Object.keys(LIVE_ONLY).every((t) => !CREATED.has(t)));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. AND THE OTHER DIRECTION. EVERY TABLE THIS REPO CREATES IS ONE THE PRODUCT USES.
//
// EQUALITY, NOT SUBSET. A migration for a table nothing reads is either a feature that was removed
// and left its furniture behind, or a table somebody meant to use and never wired up. Both are worth
// knowing, and neither announces itself.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. every table this repo creates is addressed by the product ===\n');

const CREATED_UNUSED = {
  user_goals:
    'Rakha\'s goals store from doc 82. supabase/APPLY_2026-07-31_goals_consolidation.sql records the founder\'s decision that public.goals wins and user_goals becomes READ ONLY LEGACY BY CONVENTION, deliberately NOT dropped because unreleased phone builds still read it and dropping it would turn every installed test build into an error screen. The drop is launch two\'s decision. test/goalstore.test.mjs already fails the build if a WRITER ever comes back, so this entry covers the reader half.',
  content_ideas:
    'The ideas bank. supabase/APPLY_2026-07-31_hoka_cleanup.sql wipes it and the code that reached it was removed with the Idea type, as recorded at lib/supabase.ts:8576 and :8782. The table is still created and still live, and nothing reads it. Named here rather than dropped so the drop is a decision somebody takes on purpose.',
  monthly_summaries:
    'Created by supabase/schema.sql:78 in the original Phase 0 build plan, given row level security and a select own policy, present in the live catalogue on 16 August 2026, and read or written by ZERO source files. docs/08_PROGRESS.md:238 still describes it as "Empty until data flows" and the data never flowed: the month view is computed from transactions instead. Kept rather than dropped because it is empty and harmless, and named here so nobody mistakes it for a table the product depends on.',
  studio_agent_runs:
    'Created by supabase/APPLY_2026-07-15_studio_agent.sql, referenced by zero source files, and absent from the live catalogue read on 16 August 2026. The migration was written and never applied, and the feature it was for reads nothing. Kept named here rather than deleted so the decision to drop the migration is taken deliberately by somebody who knows what the studio was going to do with it.',
};

for (const t of created) {
  if (t in CREATED_UNUSED) continue;
  ok(`${t} is addressed by the product`, ADDRESSED.has(t));
}
ok('and every unused table carries a reason somebody can read',
  Object.values(CREATED_UNUSED).every((why) => typeof why === 'string' && why.length > 40));
ok('and no unused entry has quietly gained a caller, which would mean deleting it here',
  Object.keys(CREATED_UNUSED).every((t) => !ADDRESSED.has(t)));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE SENTENCE THAT CAUSED IT.
//
// A comment asserting a posture for a table it does not itself alter is how this hid for a month.
// This does not ban the sentence. It requires that when a SQL file claims another table's posture
// by name, that other table actually has an enable statement somewhere in this repo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. no SQL comment claims a posture this repo does not actually set ===\n');

for (const rel of sqlFiles) {
  const src = read(rel);
  for (const line of src.split('\n')) {
    if (!/^\s*--/.test(line)) continue;
    if (!/RLS on|row level security/i.test(line)) continue;
    const named = line.match(/\b((?:public\.)?[a-z_][a-z0-9_]{3,})\b/gi) || [];
    for (const raw of named) {
      const t = raw.toLowerCase().replace(/^public\./, '');
      if (!CREATED.has(t)) continue;
      ok(`🔴 ${rel} names ${t} beside a row level security claim, and ${t} is actually protected here`,
        PROTECTED.has(t));
    }
  }
}

console.log(`\n  schema parity: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
