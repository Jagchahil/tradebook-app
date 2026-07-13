// Rotate the khoji_writer database password. One command. Nobody ever sees the password.
//
//   node rotate.mjs            rotate for real
//   node rotate.mjs --dry-run  prove the current credential works, change nothing
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS, AND IT IS NOT CONVENIENCE
//
// Rotating this password by hand took five attempts on 13 July 2026, and every failure was a human
// carrying a credential from one place to another:
//
//   1. `read -rsp` is bash. The mini runs zsh, where -p means "coprocess". The read failed, the
//      variable was EMPTY, and sed cheerfully wrote a connection string with no password in it.
//   2. `openssl rand -base64 24` produces / + and =, which are STRUCTURAL CHARACTERS IN A URL. A
//      slash in a password ends the host portion of a connection string.
//   3. The `alter role` was run against the database while a DIFFERENT password sat in .env, so the
//      two never matched.
//   4. And the real one: SUPABASE'S POOLER CACHES THE PASSWORD VERIFIER. A password changed in the
//      SQL editor takes a few minutes to reach the pooler. Every retry inside that window returns
//      28P01 "password authentication failed", which reads exactly like a wrong password and is
//      not one. I diagnosed from the error message instead of from the system, three times.
//
// Every one of those is a human moving a secret between a terminal, a clipboard, a SQL editor and a
// file. So stop doing that. THE ROLE CAN CHANGE ITS OWN PASSWORD. Postgres permits any role with
// LOGIN to run ALTER ROLE <self> WITH PASSWORD. khoji_writer never needed us to carry anything.
//
// ---------------------------------------------------------------------------------------------
// WHAT IT DOES, IN ORDER, AND WHY EACH STEP IS THERE
//
//   1. Connect with the CURRENT credential. If that fails, stop: rotating from a broken state is
//      how you end up with a database nobody can reach.
//   2. Mint a new password. HEX ONLY. No / + = so a URL can never misread it (see failure 2).
//   3. ALTER ROLE khoji_writer WITH PASSWORD, executed BY khoji_writer, on itself.
//   4. Write .env atomically (temp file, then rename), so a crash mid-write cannot leave a .env
//      that is half old and half new.
//   5. WAIT OUT THE POOLER, then prove the new credential connects. This is the step that four
//      manual attempts did not have, and it is the whole reason they looked like failures.
//   6. If the new one will not connect, PUT THE OLD PASSWORD BACK and restore .env. A rotation that
//      leaves the brain unable to reach its database is worse than no rotation, and it would go
//      unnoticed until /api/health turned red tomorrow.
//
// The password exists only inside this process. It is never printed, never in a clipboard, never in
// a shell history, never in a transcript, and never in a chat with an AI. Including this one.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(HERE, '.env');
const DRY = process.argv.includes('--dry-run');

// Supabase's pooler caches the password verifier. A change made through the database is not visible
// to the pooler immediately, and inside that window it returns 28P01, which is indistinguishable
// from a genuinely wrong password. That single fact cost five attempts and an afternoon.
export const POOLER_CACHE_WAIT_MS = 20_000;
export const POOLER_ATTEMPTS = 9; // 9 x 20s = three minutes of patience before we call it a real failure

const log = (...a) => console.log('[khoji:rotate]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnv() {
  const raw = readFileSync(ENV, 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('KHOJI_DB_URL='));
  if (!line) throw new Error('.env has no KHOJI_DB_URL line');
  return { raw, url: line.slice('KHOJI_DB_URL='.length).trim() };
}

// Swap the password inside a connection string without touching anything else.
export function withPassword(url, password) {
  return url.replace(/(:\/\/[^:]+:)[^@]*(@)/, `$1${password}$2`);
}

function writeEnv(raw, newUrl) {
  const next = raw
    .split('\n')
    .map((l) => (l.startsWith('KHOJI_DB_URL=') ? `KHOJI_DB_URL=${newUrl}` : l))
    .join('\n');
  // Atomic: write beside it, then rename. A crash halfway through cannot leave a .env that is half
  // one password and half another, which is a state nothing would recover from cleanly.
  const tmp = `${ENV}.rotating`;
  writeFileSync(tmp, next, { mode: 0o600 });
  renameSync(tmp, ENV);
}

async function connect(url) {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await c.connect();
  return c;
}

async function canConnect(url) {
  try {
    const c = await connect(url);
    await c.query('select 1');
    await c.end();
    return true;
  } catch (e) {
    return e.code || e.message;
  }
}

async function main() {
  const { raw, url } = readEnv();

  // 1. The current credential must work. Never rotate from a broken state.
  log('checking the CURRENT credential...');
  const now = await canConnect(url);
  if (now !== true) {
    console.error(`[khoji:rotate] fatal: the current password does not work (${now}).`);
    console.error('[khoji:rotate] Rotating from a broken state would leave the brain unreachable. Fix this first.');
    process.exit(1);
  }
  log('current credential works.');

  if (DRY) { log('dry run. Nothing changed.'); return; }

  // 2. Hex only. No / + = : a URL cannot misread them, and that mistake cost an afternoon.
  const next = randomBytes(16).toString('hex');

  // 3. The role changes its OWN password. It never needed a human courier.
  log('setting the new password (the role alters itself)...');
  const c = await connect(url);
  try {
    await c.query(`alter role khoji_writer with password '${next}'`);
  } finally {
    await c.end();
  }

  // 4. Rewrite .env atomically.
  const newUrl = withPassword(url, next);
  writeEnv(raw, newUrl);
  log('.env rewritten.');

  // 5. Prove it. THE STEP EVERY MANUAL ATTEMPT WAS MISSING.
  //
  // Supabase's pooler is still holding the old verifier and will reject the new password with 28P01
  // for a couple of minutes. That error is identical to a genuinely wrong password, which is exactly
  // why four manual retries looked like four failures. Wait it out before believing anything.
  log('waiting for the pooler to catch up. It caches the old password, and 28P01 during this window');
  log('means nothing at all. This is the step that made five manual attempts look like failures.');
  for (let i = 1; i <= POOLER_ATTEMPTS; i++) {
    await sleep(POOLER_CACHE_WAIT_MS);
    const ok = await canConnect(newUrl);
    if (ok === true) {
      log(`the new credential works (after ${(i * POOLER_CACHE_WAIT_MS) / 1000}s).`);
      log('rotation complete. The password was never printed, never copied, and is nowhere but the');
      log('database and this .env, which is mode 0600 and excluded from every rsync and every repo.');
      return;
    }
    log(`  attempt ${i}/${POOLER_ATTEMPTS}: ${ok} (expected while the pooler is stale)`);
  }

  // 6. It genuinely will not connect. Put it back. A brain that cannot reach its database is worse
  //    than an unrotated password, and it would sit silently until /api/health went red tomorrow.
  console.error('[khoji:rotate] the new password never worked. ROLLING BACK.');
  const back = await connect(url).catch(() => null);
  if (back) {
    // The old password still opens a session, because the pooler is caching it. Use that to undo.
    const old = url.match(/:\/\/[^:]+:([^@]*)@/)[1];
    await back.query(`alter role khoji_writer with password '${old}'`);
    await back.end();
    writeEnv(raw, url);
    console.error('[khoji:rotate] rolled back. The old password and the old .env are restored.');
  } else {
    console.error('[khoji:rotate] COULD NOT ROLL BACK. The new password is in .env and in the database,');
    console.error('[khoji:rotate] and one of them is not being honoured. Do not panic: khoji_writer can');
    console.error('[khoji:rotate] only touch knowledge_items. Reset it from the Supabase SQL editor.');
  }
  process.exit(1);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => { console.error('[khoji:rotate] fatal:', err.message); process.exit(1); });
}
