// 🔴 KHOJI WATCHES THE PROFESSIONAL AND REGULATORY BODIES. Card A: "beyond gov.uk".
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// lawwatch.mjs watches the primary law. amend.mjs watches for a GOV.UK document changing silently.
// This is the same discipline turned on the OTHER authoritative voices a UK sole trader tradesperson
// is actually bound by or should know about: the professional accountancy bodies, the pensions and
// data protection regulators, the construction-trade certification schemes. None of it is HMRC, all
// of it can still change a tradesperson's costs, obligations, or what they should be doing.
//
// 🔴 THIS FILE IS NOT "ADD ANY SITE THAT LOOKS USEFUL". Every URL in bodies.json passed an explicit
// terms-of-use and robots.txt check first (27 Jul 2026 sweep), the same way lawwatch.mjs's
// ALLOWED_HOSTS is a proven list, not a guess. FOUR sources were excluded outright because their
// terms explicitly forbid automated access (FCA, its OPBAS arm, AAT) or explicitly name-block
// AI crawlers in robots.txt (ICAS, NICEIC) — that second one matters specifically because WE are an
// Anthropic-built system, and routing around an explicit "no Claude, no GPTBot" signal by using a
// different user agent string would be exactly that: routing around it, not honouring it. Several
// more were left OUT, not IN, because the confirming page itself blocked automated fetch (CIOT, IFA,
// Gas Safe Register) or the licence position was unclear (ACCA, TrustMark, The Pensions Regulator).
// bodies.json's `_excluded` block names every one of them and why. Read it before adding a source here.
//
// ⚠️ THE SAME HONESTY RULES AS EVERY OTHER WATCHER (doc 105, the July five-day death):
//   . FIRST SIGHT IS A BASELINE, NOT AN ALARM.
//   . THE BODY IS THE SIGNAL, HASHED. None of these sites expose a clean content API the way GOV.UK
//     and legislation.gov.uk do, so this strips script/style/nav/header/footer and every remaining
//     tag before hashing, which is an approximation, not a guarantee. If a source turns out noisy in
//     practice (a "last viewed" counter, a rotating banner), that is a per-source fix here, the same
//     way cisGrossRate needed a fix, not a reason to stop watching it.
//   . A RUN THAT READ NOTHING IS NOT A RUN. It exits 1, loud.
//   . A PAGE WE COULD NOT READ IS BLIND, NEVER 'unchanged'.
//   . EVERY khoji_runs WRITE FROM THIS FILE IS LABELLED kind='bodies', so the console never renders
//     this as a tax-constant run or a law run. Two writers over one signal always drift.
//   . A CHANGE HERE IS NEVER TRUSTED VERBATIM. Unlike corpus.mjs's status='verbatim' (HMRC's own
//     words, OGL licensed, safe to quote directly), nothing in this file is government-licensed text,
//     so every change lands as status='needs_distillation': a prompt for a human to go and look,
//     never a claim asserted to a user before someone has read it and approved it on /team.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const DB_URL = process.env.KHOJI_DB_URL || '';
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';
const TIMEOUT_MS = 20000;

function log(...a) { console.log('[khoji:bodies]', ...a); }

// 🔴 Only these hosts may ever be watched, enforced in code so a careless addition to bodies.json
// cannot point Khoji at a source the 27 Jul sweep never cleared. Update this list ONLY alongside a
// fresh terms-of-use + robots.txt check, recorded in bodies.json's own comments.
export const ALLOWED_HOSTS = [
  'www.att.org.uk', 'att.org.uk',
  'ico.org.uk',
  'www.hse.gov.uk', 'hse.gov.uk',
  'www.citb.co.uk', 'citb.co.uk',
  'www.napit.org.uk', 'napit.org.uk',
  'www.cscs.uk.com', 'cscs.uk.com',
  'www.acas.org.uk', 'acas.org.uk',
  'www.businesscompanion.info', 'businesscompanion.info',
];

export function isAllowed(url) {
  try { return ALLOWED_HOSTS.includes(new URL(url).host.toLowerCase()); }
  catch { return false; }
}

export function hashOf(text) {
  return createHash('sha256').update(text || '').digest('hex').slice(0, 16);
}

// No clean content API on any of these sites, unlike GOV.UK's Content API or legislation.gov.uk's
// data.xml. Strip the furniture as best effort: scripts, styles, nav/header/footer landmarks, then
// every remaining tag, then collapse whitespace. What is left is an approximation of "the readable
// text", which is the same spirit as the API-backed watchers, achieved by hand because these sources
// do not hand it to us.
export function textOf(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadSources() {
  const raw = JSON.parse(readFileSync(path.join(HERE, 'bodies.json'), 'utf8'));
  return Array.isArray(raw.sources) ? raw.sources : [];
}

// 🔴 THE COMPARISON. Same spirit as lawwatch.mjs, minus the "revised version" signal: none of these
// sites publish a machine-readable version number the way legislation.gov.uk does, so there are only
// three outcomes here, not four.
export function compare(previous, now) {
  if (!previous) return { verdict: 'baseline', note: null };
  const moved = now.bodyHash !== previous.bodyHash;
  if (moved) {
    return {
      verdict: 'silent',
      note: 'This page changed and nothing announced it. Somebody has to read it before we know whether it affects a customer.',
    };
  }
  return { verdict: 'unchanged', note: null };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return textOf(await res.text());
}

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function main() {
  const sources = loadSources();

  // Guard: a bad addition to bodies.json must never send us at an unlicensed host.
  const illegal = sources.filter((s) => !isAllowed(s.url));
  if (illegal.length) {
    log('🔴 REFUSING TO RUN: unlicensed host in bodies.json:', illegal.map((s) => s.url).join(', '));
    process.exit(1);
  }

  if (!DRY && !DB_URL) {
    log('🔴 NO KHOJI_DB_URL. This run cannot record anything, so it is not a run.');
    process.exit(1);
  }

  const started = Date.now();
  const read = [];
  const failed = [];

  for (const s of sources) {
    try {
      const text = await fetchText(s.url);
      read.push({ name: s.name, url: s.url, field: s.field, bodyHash: hashOf(text), textLen: text.length });
    } catch (e) {
      failed.push({ name: s.name, url: s.url });
      log(`  BLIND ${String(s.field || '').padEnd(16)} ${s.name}  (${e.message})`);
    }
  }

  // 🔴 A RUN THAT READ NOTHING IS NOT A RUN.
  if (read.length === 0) {
    log('🔴 READ NOTHING. Every source was unreachable. Exiting loud, not green.');
    if (!DRY) {
      await withDb((db) => db.query(
        `insert into public.khoji_runs (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
         values ('bodies', null, $1, 0, 0, 0, $1, $2, $3, false)`,
        [sources.length, failed.map((f) => f.url), Date.now() - started],
      )).catch(() => {});
    }
    process.exit(1);
  }

  if (DRY) {
    log(`dry run. read ${read.length} of ${sources.length}, failed ${failed.length}. Nothing written.`);
    for (const r of read) log(`  ${r.bodyHash}  ${r.name}  (${r.textLen} chars)`);
    return;
  }

  let silent = 0;
  await withDb(async (db) => {
    for (const r of read) {
      const prev = await db.query('select body_hash from public.khoji_bodies where url = $1 limit 1', [r.url]);
      const previous = prev.rows[0] ? { bodyHash: prev.rows[0].body_hash } : null;
      const { verdict, note } = compare(previous, r);
      if (verdict === 'silent') {
        silent++;
        log(`  🔴 CHANGED ${String(r.field || '').padEnd(16)} ${r.name}  ${r.url}`);
        await db.query(
          `insert into public.knowledge_items
             (source_url, source_name, title, summary, affects, confidence, engine_impact, status, raw, distilled_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
           on conflict (source_url) do nothing`,
          [
            `${r.url}#bodies-${r.bodyHash}`,
            'Khoji bodies watcher',
            `CHANGED: ${r.name}`,
            [
              note,
              '',
              `Source: ${r.name}`,
              `URL: ${r.url}`,
              '',
              'This is not HMRC or primary law, so it is never taken as read: someone has to open the',
              'page, decide whether it actually affects a customer, and only then does anything reach',
              'them. Approve or dismiss on the Brain desk in /team, same as every other Khoji finding.',
            ].join('\n'),
            'UK self employed tradespeople',
            null,   // no model guessed this, it is a hash
            false,  // not proven engine impact, it is a prompt to look
            'needs_distillation',
            { url: r.url, name: r.name, field: r.field, verdict },
          ],
        );
      }

      await db.query(
        `insert into public.khoji_bodies (url, name, field, body_hash, verdict, ok, checked_at)
           values ($1,$2,$3,$4,$5,true,now())
         on conflict (url) do update set
           name = excluded.name, field = excluded.field, body_hash = excluded.body_hash,
           verdict = excluded.verdict, ok = true, checked_at = now()`,
        [r.url, r.name, r.field, r.bodyHash, verdict],
      );
    }

    await db.query(
      `insert into public.khoji_runs (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
       values ('bodies', null, $1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sources.length,
        read.length,
        read.length - silent,
        silent,
        failed.length,
        failed.map((f) => f.url),
        Date.now() - started,
        failed.length === 0,
      ],
    );
  });

  log(`read ${read.length} of ${sources.length} bodies. ${silent} changed, ${failed.length} unreadable.`);
  // Not knowing is not the same as being fine.
  process.exit(failed.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    log('🔴 THREW:', e.message);
    if (DB_URL && !DRY) {
      await withDb((db) => db.query(
        `insert into public.khoji_runs (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
         values ('bodies', null, 0, 0, 0, 0, 0, '{}', null, false)`,
      )).catch(() => {});
    }
    process.exit(1);
  });
}
