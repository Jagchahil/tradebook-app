// Tests for the 26 July pre-launch hardening pass.
//
// Every one of these pins a fix that was made after an audit found the gap. They exist so the
// gap cannot quietly come back: each test names the failure it is guarding against, because a
// test whose purpose nobody remembers is a test somebody deletes.
//
//   node test/hardening.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (rel, tag) =>
  import(`${pathToFileURL(path.resolve(here, rel)).href}${tag ? `?case=${tag}` : ''}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// --- 1. The bank feed refuses to run without its encryption key ---------------------------------
//
// THE FAILURE THIS GUARDS AGAINST. hasBankFeedConfig used to ask only "do we have TrueLayer
// credentials". If BANK_TOKEN_KEY went missing (a renamed env var, a rollback, set on Preview and
// not Production) the bank feed carried on, and lib/crypto.ts silently stored every bank access
// and refresh token in plain text. Nothing errored. Nobody would have known.
console.log('\n=== bank feed: the encryption key is part of the configuration ===\n');
{
  const KEY = 'a'.repeat(64); // 64 hex chars = a valid 32 byte key

  process.env.BANK_CLIENT_ID = 'test-client';
  process.env.BANK_CLIENT_SECRET = 'test-secret';
  process.env.BANK_TOKEN_KEY = KEY;
  const withKey = await load('../lib/bankfeed.ts', 'withkey');
  ok('configured with a token key: the feed is live', withKey.hasBankFeedConfig() === true);

  delete process.env.BANK_TOKEN_KEY;
  const noKey = await load('../lib/bankfeed.ts', 'nokey');
  ok(
    'TrueLayer keys set but NO token key: the feed refuses to run',
    noKey.hasBankFeedConfig() === false,
  );

  delete process.env.BANK_CLIENT_ID;
  delete process.env.BANK_CLIENT_SECRET;
  process.env.BANK_TOKEN_KEY = KEY;
  const unconfigured = await load('../lib/bankfeed.ts', 'unconfigured');
  ok(
    'nothing configured at all: still dormant, the normal pre-launch state',
    unconfigured.hasBankFeedConfig() === false,
  );

  delete process.env.BANK_TOKEN_KEY;
}

// --- 2. No hardcoded non-canonical site URL ------------------------------------------------------
//
// THE FAILURE THIS GUARDS AGAINST. Twelve files fell back to a raw vercel.app preview domain when
// NEXT_PUBLIC_APP_URL was unset. That domain went into the sitemap and robots.txt (telling Google
// the preview is the real site), into invoice links, and into referral links. CLAUDE.md's rule is
// that the site URL comes from the env var or the SITE constant, never a hardcoded string.
console.log('\n=== domain: the fallback is lekhio.app, never a preview host ===\n');
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const roots = ['../app', '../lib'].map((r) => path.resolve(here, r));
  const offenders = [];
  const walk = (dir) => {
    // withFileTypes, so we never stat a path. A real checkout carries dot directories with
    // broken symlinks in them (app/.node/bin/corepack), and statSync throws on a dangling link,
    // which would fail this suite for a reason that has nothing to do with what it tests.
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // tooling, not our source
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      for (const line of src.split('\n')) {
        // A quoted vercel.app URL used as a value. A mention inside a comment explaining the old
        // bug is fine and deliberate, so only quoted strings count.
        if (/['"`]https:\/\/[^'"`]*\.vercel\.app/.test(line)) {
          offenders.push(`${path.relative(path.resolve(here, '..'), full)}: ${line.trim()}`);
        }
      }
    }
  };
  roots.forEach(walk);
  if (offenders.length) offenders.forEach((o) => console.log(`        ${o}`));
  ok('no hardcoded vercel.app URL anywhere in app/ or lib/', offenders.length === 0);
}

// --- 3. The dead Phase 0 scaffold is gone --------------------------------------------------------
//
// THE FAILURE THIS GUARDS AGAINST. web/src/ held a duplicate of the WhatsApp webhook from the
// first build. Its handler created a full user account for ANY inbound phone number, with no OTP
// and no signup, the exact opposite of the live handler. It was unreachable, but it sat behind a
// tsconfig path alias, and it had its own passing test suite, which is how a landmine ends up
// looking maintained. Both are deleted; this stops either coming back.
console.log('\n=== dead code: the Phase 0 scaffold stays deleted ===\n');
{
  const { existsSync } = await import('node:fs');
  const repo = path.resolve(here, '..');
  ok('web/src/ does not exist', !existsSync(path.join(repo, 'src')));
  ok('its dead test suite does not exist', !existsSync(path.join(repo, 'test/webhook.test.ts')));
  const tsconfig = JSON.parse(
    (await import('node:fs')).readFileSync(path.join(repo, 'tsconfig.json'), 'utf8'),
  );
  ok(
    'the @/* path alias pointing into src/ is gone',
    tsconfig.compilerOptions?.paths === undefined,
  );
}

// --- 4. No path that ships customer audio to a third party --------------------------------------
//
// THE FAILURE THIS GUARDS AGAINST. lib/transcribe.ts uploaded customer voice notes to the OpenAI
// Whisper API. By 26 July nothing imported it: transcription had moved to the Mac mini, which does
// the work locally, and the published privacy policy says in writing that voice notes "never leave
// our systems" and that "no third party ever hears your voice note". The file stayed in the tree
// anyway, complete and ready to work the moment anyone imported it or set OPENAI_API_KEY, and the
// team console carried a card telling Jag to paste that very key into Vercel. That is worse than
// ordinary dead code, because the blast radius is a promise made to a customer in a legal document.
// All of it is deleted. This stops it returning quietly.
console.log('\n=== voice: no path that ships customer audio to a third party ===\n');
{
  const { existsSync, readFileSync, readdirSync } = await import('node:fs');
  const repo = path.resolve(here, '..');
  ok('lib/transcribe.ts does not exist', !existsSync(path.join(repo, 'lib/transcribe.ts')));

  const offenders = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      for (const line of src.split('\n')) {
        // The capability, not the mention. A comment explaining why we do NOT do this is
        // deliberate and must stay readable, so only a real endpoint or key read counts.
        if (/['"`]https:\/\/api\.openai\.com/.test(line) || /process\.env\.OPENAI_API_KEY/.test(line)) {
          offenders.push(`${path.relative(repo, full)}: ${line.trim()}`);
        }
      }
    }
  };
  ['../app', '../lib'].map((r) => path.resolve(here, r)).forEach(walk);
  if (offenders.length) offenders.forEach((o) => console.log(`        ${o}`));
  ok('no OpenAI audio endpoint or key read in app/ or lib/', offenders.length === 0);
}

// ---------------------------------------------------------------------------------------------
// 5. 🔴 NO ROUTE MAY LIVE IN A FOLDER .gitignore SWALLOWS.
//
// Added 28 July 2026, after it happened. The sign out route was written as app/api/auth/out/, and
// .gitignore carries `out/` for the Next.js static export folder. The pattern matched, `git add -A`
// silently skipped the file, and commit 1e7160db went to production with a sign out button posting
// at a route that was not in the repository.
//
// Every local check passed, because the file was on the disk that ran them. Only CI noticed, because
// CI checks out from git rather than from the machine that wrote the code. That is the whole shape
// of this bug: it is invisible everywhere except the one place that matters.
//
// So this reads the REAL .gitignore rather than a hardcoded list, takes every directory rule out of
// it, and fails if any folder under app/ or lib/ is named the same. The next `build`, `dist`,
// `coverage` or `out` route cannot disappear the same way, and if someone adds a new directory rule
// to .gitignore, this test starts guarding that too without being edited.
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const repo = path.resolve(here, '..');
  const ignore = readFileSync(path.join(repo, '.gitignore'), 'utf8');
  const dirRules = ignore
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
    .filter((l) => l.endsWith('/'))
    .map((l) => l.replace(/\/$/, '').replace(/^\//, ''))
    .filter((l) => l && !l.includes('*'));

  const offenders = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (dirRules.includes(entry.name)) {
        offenders.push(`${path.relative(repo, path.join(dir, entry.name))}  (matches .gitignore rule "${entry.name}/")`);
        continue;
      }
      walk(path.join(dir, entry.name));
    }
  };
  ['../app', '../lib'].map((r) => path.resolve(here, r)).forEach(walk);
  if (offenders.length) offenders.forEach((o) => console.log(`        ${o}`));
  ok('the .gitignore directory rules were actually read', dirRules.length >= 3);
  ok('🔴 NO FOLDER UNDER app/ OR lib/ IS NAMED AFTER A .gitignore DIRECTORY RULE', offenders.length === 0);
}

// The other two fixes from this pass are pinned in the suites that already own those modules,
// because both files need staging to load under type stripping and duplicating that machinery
// here would be a second place to maintain it:
//   . the render URL host allowlist  -> test/higgsfield.test.mjs
//   . constant time secret comparison -> test/connectors.test.mjs

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);
