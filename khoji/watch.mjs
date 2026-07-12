// Khoji, the Lekhio knowledge watcher (Phase D, doc 82 section 5 Layer 2).
//
// Runs on a launchd timer on the Mac mini. Each run it: pulls the configured
// GOV.UK / HMRC sources, finds items it has not seen, stores them in Supabase
// (as needs_distillation while credit is off, distilled once it is on), writes a
// human readable markdown note into an Obsidian vault, and, when distillation is
// enabled, works through any backlog of pending items. It is isolated: its own
// directory, its own launchd job, its own narrowly scoped database role. It
// never touches anything else on the mini.
//
//   node watch.mjs            normal run
//   node watch.mjs --dry-run  fetch and parse only, write nothing, print a report
//
// Requires: Node 18+ (global fetch) and the `pg` package (npm i pg). No other deps.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distill, distillEnabled } from './distill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const MAX_ITEMS = Number(process.env.KHOJI_MAX_ITEMS || 25);
const VAULT = process.env.OBSIDIAN_VAULT || '';
const DB_URL = process.env.KHOJI_DB_URL || '';

function log(...a) { console.log('[khoji]', ...a); }

// ---- fetching and parsing ---------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'LekhioKhoji/1.0 (+https://lekhio.app)', accept: 'application/atom+xml, text/html' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function stripTags(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Minimal Atom parse: one row per <entry>. No XML dependency; feeds are well formed
// and any single malformed entry is skipped rather than failing the whole source.
export function parseAtom(xml, sourceName) {
  const out = [];
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
  for (const e of entries) {
    try {
      const title = stripTags((e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
      const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || (e.match(/<id>([\s\S]*?)<\/id>/) || [])[1];
      const updated = (e.match(/<(?:updated|published)>([\s\S]*?)<\/(?:updated|published)>/) || [])[1] || null;
      const summary = stripTags((e.match(/<(?:summary|content)[^>]*>([\s\S]*?)<\/(?:summary|content)>/) || [])[1]).slice(0, 2000);
      if (!link || !title) continue;
      out.push({ source_name: sourceName, title: title.slice(0, 400), source_url: link.trim(), published: updated, raw: { summary } });
    } catch { /* skip a bad entry */ }
  }
  return out;
}

// A watched page becomes an item only when its main text changes. We hash the
// stripped body and put the short hash in the source_url, so an unchanged page
// dedupes and a changed one is a new row.
export function pageItem(url, sourceName, html) {
  const body = stripTags(html).slice(0, 20000);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  return {
    source_name: sourceName,
    title: (titleMatch ? stripTags(titleMatch[1]) : url).slice(0, 400),
    source_url: `${url}#${hash}`,
    published: null,
    raw: { url, hash, content: body.slice(0, 6000), note: 'page content change detected' },
  };
}

async function collect(sources) {
  const items = [];
  for (const s of sources) {
    try {
      const text = await fetchText(s.url);
      if (s.type === 'atom') items.push(...parseAtom(text, s.name));
      else if (s.type === 'page') items.push(pageItem(s.url, s.name, text));
      log(`fetched ${s.name}`);
    } catch (err) {
      log(`source failed, skipping: ${s.name}: ${err.message}`);
    }
  }
  return items;
}

// ---- Obsidian note ----------------------------------------------------------

export function slug(s) {
  return (s || 'update').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'update';
}

function writeNote(item, d) {
  if (!VAULT) return;
  const dir = path.join(VAULT, 'Khoji');
  mkdirSync(dir, { recursive: true });
  const date = (item.published || new Date().toISOString()).slice(0, 10);
  const file = path.join(dir, `${date}-${slug(item.title)}.md`);
  const link = (item.raw && item.raw.url) || item.source_url.split('#')[0];
  const fm = [
    '---',
    `source: ${link}`,
    `source_name: ${item.source_name || ''}`,
    `status: ${d ? 'distilled' : 'needs_distillation'}`,
    d && d.effective_date ? `effective_date: ${d.effective_date}` : 'effective_date:',
    d && d.affects ? `affects: ${JSON.stringify(d.affects)}` : 'affects:',
    d ? `engine_impact: ${d.engine_impact}` : 'engine_impact: false',
    d && d.confidence != null ? `confidence: ${d.confidence}` : 'confidence:',
    'reviewed: false',
    '---',
  ].join('\n');
  const body = d && d.summary
    ? `# ${item.title}\n\n${d.summary}\n\n${d.engine_impact ? '> [!warning] Possible engine change. Check the tax engine and exams.\n\n' : ''}Source: ${link}\n`
    : `# ${item.title}\n\n_Not yet distilled (AI credit off). Raw update captured._\n\n${(item.raw && item.raw.summary) || ''}\n\nSource: ${link}\n`;
  writeFileSync(file, `${fm}\n${body}`);
  return file;
}

// ---- database (least privilege: khoji_writer, this table only) --------------

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function main() {
  const cfg = JSON.parse(readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
  const items = await collect(cfg.sources || []);
  log(`collected ${items.length} candidate items; distillation ${distillEnabled() ? 'ON' : 'OFF (dormant)'}`);

  if (DRY) {
    for (const it of items.slice(0, MAX_ITEMS)) log('WOULD STORE:', it.source_name, '::', it.title);
    log(`dry run: ${Math.min(items.length, MAX_ITEMS)} would be stored, none written.`);
    return;
  }
  // EXIT LOUD. This used to `return`, which meant a watcher that could not reach its database
  // fetched all 14 sources, wrote precisely nothing, and exited 0. launchd recorded a success.
  //
  // That is not a hypothetical. On 8 July 2026 a stray letter landed on the front of a key in
  // .env (`rKHOJI_DB_URL`), the shell sourced it happily because it is a valid assignment to a
  // variable nobody reads, and the brain silently stopped learning for four days while every
  // signal we had said it was fine. A worker that cannot reach its database HAS NOT SUCCEEDED.
  if (!DB_URL) {
    console.error('[khoji] fatal: KHOJI_DB_URL is not set. Nothing was written. Check .env.');
    process.exit(1);
  }

  await withDb(async (db) => {
    // Dedupe against what we already hold.
    const urls = items.map((i) => i.source_url);
    const seen = new Set();
    if (urls.length) {
      const r = await db.query('select source_url from public.knowledge_items where source_url = any($1)', [urls]);
      for (const row of r.rows) seen.add(row.source_url);
    }
    const fresh = items.filter((i) => !seen.has(i.source_url)).slice(0, MAX_ITEMS);
    log(`${fresh.length} new after dedupe`);

    let engineChanged = false;
    let notes = 0;
    for (const it of fresh) {
      const d = await distill(it); // null when dormant
      if (d?.engine_impact) engineChanged = true;
      await db.query(
        `insert into public.knowledge_items
           (source_url, source_name, title, summary, effective_date, affects, confidence, engine_impact, status, raw, distilled_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (source_url) do nothing`,
        [it.source_url, it.source_name, it.title, d?.summary ?? null, d?.effective_date ?? null, d?.affects ?? null,
         d?.confidence ?? null, d?.engine_impact ?? false, d ? 'distilled' : 'needs_distillation', it.raw ?? {}, d ? new Date() : null],
      );
      if (writeNote(it, d)) notes++;
    }
    log(`stored ${fresh.length}, wrote ${notes} Obsidian notes`);

    // Backlog: once distillation is on, work through items captured while dormant.
    if (distillEnabled()) {
      const pend = await db.query(
        "select id, source_url, source_name, title, raw from public.knowledge_items where status = 'needs_distillation' order by created_at asc limit $1",
        [MAX_ITEMS],
      );
      let done = 0;
      for (const row of pend.rows) {
        const d = await distill({ title: row.title, source_url: row.source_url, raw: row.raw });
        if (!d) continue;
        await db.query(
          "update public.knowledge_items set summary=$1, effective_date=$2, affects=$3, confidence=$4, engine_impact=$5, status='distilled', distilled_at=now() where id=$6",
          [d.summary, d.effective_date, d.affects, d.confidence, d.engine_impact, row.id],
        );
        if (d.engine_impact) engineChanged = true;
        writeNote({ title: row.title, source_url: row.source_url, source_name: row.source_name, raw: row.raw }, d);
        done++;
      }
      if (pend.rows.length) log(`re-distilled ${done} of ${pend.rows.length} pending`);
    }

    if (engineChanged) {
      try {
        const r = await db.query("update public.qa_cache set status = 'stale' where status = 'active'");
        log(`engine change detected, marked ${r.rowCount} cached answers stale`);
      } catch (e) {
        log(`engine change detected, cache invalidation skipped: ${e.message}`);
      }
    }
  });
  log('done');
}

// Only run when executed directly (node watch.mjs), not when imported for tests.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => { console.error('[khoji] fatal:', err.message); process.exit(1); });
}
