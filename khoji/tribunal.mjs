// KHOJI WATCHES THE COURTS. Because a judge can reverse a tax answer without HMRC touching a page.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ON 6 APRIL 2025, DOUBLE-CAB PICKUPS BECAME CARS.
//
// Not because HMRC edited a page. Because the COURT OF APPEAL decided Payne / Coca-Cola. A judgment
// changed the tax answer for tens of thousands of tradesmen, and every watcher we own would have gone
// on reporting green, because every watcher we own reads GOV.UK, and GOV.UK had not changed yet.
//
// Our clothing rule rests on Mallalieu v Drummond. Our illegal-dividend block rests on Global
// Corporate v Hale. Our whole "wholly and exclusively" line rests on ITTOIA s34 as the courts have
// read it. Any of those can be distinguished, narrowed or overturned next month, and the first thing
// that would happen is: nothing. We would carry on, confidently, telling men the old answer.
//
// diff.mjs asks "is the NUMBER still right". corpus.mjs asks "is the SENTENCE still there".
// amend.mjs asks "did the DOCUMENT change". NONE OF THEM CAN SEE A JUDGE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 AND THE LICENCE. I WAS WRONG ABOUT THIS AND IT COST US A WEEK OF NOT BUILDING IT.
//
// The note in my head said: "Find Case Law's Open Justice Licence excludes computational analysis,
// so case law is blocked until the licence arrives." I repeated that for a week without reading it.
//
// What the licence ACTUALLY says (caselaw.nationalarchives.gov.uk/what-you-can-do-freely, read
// 14 July 2026), and it is far more permissive:
//
//   FREE, no permission, no forms, no fee:
//     . read and download ANY judgment
//     . quote and cite judgments in your work
//     . "use commercially including incorporating judgments into your own products or applications"
//     . "copy, publish, distribute and transmit case law data"
//     . "combine judgments with other information"
//
//   NEEDS A LICENCE, and this is the whole of the restriction:
//     . "programmatic searching IN BULK ACROSS FIND CASE LAW RECORDS to identify, extract or enrich
//        contents within the records"
//
// So the restriction is on BULK DISCOVERY THROUGH THEIR API. It is not a restriction on case law.
//
// AND WE DO NOT USE THEIR API AT ALL. GOV.UK publishes the tax tribunal decisions ITSELF, 1,415 of
// them, document_type `tax_tribunal_decision`, through the SAME SEARCH ENDPOINT we already read TIINs
// from, under the OPEN GOVERNMENT LICENCE, which expressly permits commercial exploitation and
// automated processing. Different publisher. Different licence. Nothing to apply for.
//
// The Find Case Law licence is still worth having: it buys the First-tier Tribunal in bulk and the
// full text of everything through one API, and the board meets monthly, so apply. But it was never
// the thing standing between us and this file. NOT READING THE SOURCE WAS.
//
//   node tribunal.mjs             one pass
//   node tribunal.mjs --dry-run   fetch and triage only, write nothing
//   node tribunal.mjs --since=N   look back N days (default 30)

import { createHash } from 'node:crypto';

const DRY = process.argv.includes('--dry-run');
const DB_URL = process.env.KHOJI_DB_URL || '';
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';
const TIMEOUT_MS = 25000;

const sinceArg = process.argv.find((a) => a.startsWith('--since='));
const SINCE_DAYS = sinceArg ? Number(sinceArg.split('=')[1]) : 30;

const SEARCH = 'https://www.gov.uk/api/search.json';

function log(...a) { console.log('[khoji:tribunal]', ...a); }

// ---------------------------------------------------------------------------------------------
// 🔴 WHAT WE ACTUALLY CARE ABOUT. And it is a short list, on purpose.
// ---------------------------------------------------------------------------------------------
//
// 1,415 tax decisions, and the overwhelming majority are about things no tradesman will ever touch:
// hydrocarbon pipelines, loan relationships, multinational top-up tax, VAT on financial derivatives.
//
// ⚠️ A WATCHER THAT FLAGS EVERYTHING FLAGS NOTHING. If this thing raises forty items a month, Jag
// stops opening it inside a fortnight, and then the one judgment that reverses the van rule sits in
// an unread queue. Doc 103, and the corpse of cisGrossRate.
//
// So the triage is narrow and it is tied to THE RULES WE ACTUALLY ASSERT. Each entry names the rule
// it threatens, so the alarm can say WHY it is shouting, not just that it is.
export const WATCHED = [
  { rule: 'everyday_clothes', why: 'Our clothing rule IS Mallalieu v Drummond. If it is distinguished, we are wrong.',
    terms: ['wholly and exclusively', 'duality of purpose', 'ordinary clothing', 'mallalieu'] },

  { rule: 'van / car', why: 'Double-cab pickups became CARS by judgment (Payne, Coca-Cola, CA), not by HMRC page.',
    terms: ['goods vehicle', 'double cab', 'car or van', 'primarily suited'] },

  { rule: 'travel / mileage', why: 'What counts as a business journey for a man with no fixed workplace is decided in the tribunal, repeatedly.',
    terms: ['travel expenses', 'itinerant', 'place of work', 'ordinary commuting'] },

  { rule: 'cis', why: 'CIS status and gross payment are litigated constantly, and our audience IS CIS.',
    terms: ['construction industry scheme', 'gross payment status', 'subcontractor'] },

  { rule: 'employment status', why: 'Sole trader or employee is the question underneath every other question.',
    terms: ['employment status', 'self-employment', 'mutuality of obligation', 'ir35', 'intermediaries legislation'] },

  { rule: 'training', why: 'We changed this rule TODAY on HMRC guidance. Guidance is not law. A tribunal outranks it.',
    terms: ['training costs', 'capital or revenue', 'new skill'] },

  { rule: 'use_of_home', why: 'Apportionment of home costs is a classic tribunal fight.',
    terms: ['use of home', 'apportionment', 'exclusively for business'] },

  { rule: 'illegal dividend', why: 'Our block on unlawful dividends IS Global Corporate v Hale.',
    terms: ['unlawful dividend', 'distributable profits', 'director’s loan', 'global corporate'] },

  { rule: 'penalties / discovery', why: 'Whether HMRC can reopen a year decides whether a mistake is survivable.',
    terms: ['discovery assessment', 'careless', 'deliberate', 'reasonable excuse'] },
];

// The catchwords are the JUDGE'S OWN summary of what the case is about. GOV.UK gives them to us in
// `indexable_content`, free. It is the single best triage signal in UK tax and nobody uses it.
//
//   "CAPITAL ALLOWANCES - balancing charges - transfer of a hydrocarbon pipeline to wholly owned
//    subsidiary - Interaction of s279 CTA 2010 ..."
//
// You can tell in one line whether it matters to a plumber. So we read the line.
export function triage(text) {
  if (!text) return [];
  const hay = text.toLowerCase();
  return WATCHED
    .filter((w) => w.terms.some((t) => hay.includes(t.toLowerCase())))
    .map((w) => ({ rule: w.rule, why: w.why }));
}

// ⚠️ AND THE FULL DECISION IS AN ATTACHMENT, NOT THE PAGE.
//
// GOV.UK's `indexable_content` for a tribunal decision is the catchwords plus "Read full decision:"
// and a link. The judgment itself is a PDF hanging off the page. We do NOT bulk-download those, we do
// not need to, and we should not: the catchwords are enough to decide whether a HUMAN should read it,
// and a human reading one specific judgment is explicitly free under every licence involved.
export function isCatchwordsOnly(text) {
  return /read full decision/i.test(text || '');
}

// ---------------------------------------------------------------------------------------------

async function search(count = 100) {
  const url = new URL(SEARCH);
  url.searchParams.set('filter_format', 'tax_tribunal_decision');
  url.searchParams.set('order', '-public_timestamp');
  url.searchParams.set('count', String(count));
  url.searchParams.set('fields', 'title,link,public_timestamp,description,indexable_content');

  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { results: json.results || [], total: json.total ?? 0 };
}

export function isRecent(ts, sinceDays, now = new Date()) {
  if (!ts) return false;
  const t = new Date(ts);
  if (Number.isNaN(t.getTime())) return false;
  return (now.getTime() - t.getTime()) / 86_400_000 <= sinceDays;
}

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function main() {
  const started = Date.now();

  const { results, total } = await search();
  log(`${total} tax tribunal decisions on GOV.UK. Reading the newest ${results.length}.`);

  const fresh = results.filter((r) => isRecent(r.public_timestamp, SINCE_DAYS));

  const hits = [];
  for (const r of fresh) {
    const touches = triage(`${r.title} ${r.indexable_content || ''}`);
    if (touches.length) {
      hits.push({
        title: r.title,
        link: r.link,
        published: r.public_timestamp,
        catchwords: (r.indexable_content || '').replace(/\s+/g, ' ').trim().slice(0, 800),
        touches,
        hash: createHash('sha256').update(r.link).digest('hex').slice(0, 12),
      });
    }
  }

  if (DRY) {
    if (results.length === 0) {
      console.error('\n🔴 THE SEARCH RETURNED NOTHING. That is not "no judgments", it is a BLIND run.');
      process.exit(1);
    }
    log(`dry run. ${fresh.length} decision(s) in the last ${SINCE_DAYS} days, ${hits.length} touch a rule we assert.`);
    for (const h of hits) {
      log(`  🔴 ${h.touches.map((t) => t.rule).join(', ')}`);
      log(`     ${h.title.slice(0, 100)}`);
    }
    if (!hits.length) {
      log('   Nothing in the window touches us. That is the CORRECT and USUAL answer: most tax');
      log('   litigation is about pipelines and loan relationships, not about a plumber\'s van.');
      log('   A watcher that flagged all of them would be a watcher nobody opens.');
    }
    return;
  }

  if (!DB_URL) {
    console.error('[khoji:tribunal] fatal: KHOJI_DB_URL not set. Nothing was read into the record.');
    process.exit(1);
  }

  await withDb(async (db) => {
    for (const h of hits) {
      // 🔴 A JUDGMENT NEVER CHANGES A RULE AUTOMATICALLY. IT ASKS A HUMAN TO READ IT.
      //
      // This is not caution for its own sake. A model reading a judgment and deciding our clothing
      // rule has been overturned would be a model making law, and FA26 Sch 22 has a word for advice
      // that leads a client to claim more than he is entitled to. So the item lands in the SAME
      // approval queue as everything else, `needs_distillation`, with the judge's own catchwords and
      // the name of the rule it threatens. Jag reads it. Jag decides. That is the whole product.
      await db.query(
        `insert into public.knowledge_items
           (source_url, source_name, title, summary, affects, confidence, engine_impact, status, raw, distilled_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         on conflict (source_url) do nothing`,
        [
          `https://www.gov.uk${h.link}`,
          'Tax tribunal decision (GOV.UK, Open Government Licence)',
          `⚖️ MAY AFFECT: ${h.touches.map((t) => t.rule).join(', ')} — ${h.title}`,
          [
            'A tribunal has decided a case that touches a rule we assert. A judgment can reverse a tax',
            'answer without HMRC changing a single page, and no other watcher we own can see it.',
            '',
            ...h.touches.map((t) => `RULE AT RISK: ${t.rule}. ${t.why}`),
            '',
            'The judge\'s own catchwords:',
            h.catchwords,
            '',
            'Read the decision before changing anything. Nothing here is automatic.',
          ].join('\n'),
          'a rule we tell users to rely on',
          null,          // No model judged this. A keyword matched a judge's own summary.
          false,         // Not proven impact. It is a prompt to READ, not a verdict.
          'needs_distillation',
          { tribunal: true, published: h.published, touches: h.touches.map((t) => t.rule) },
        ],
      );
    }

    await db.query(
      `insert into public.khoji_runs
         (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
       values ('tribunal', null, $1, $2, $3, 0, 0, '{}', $4, true)`,
      [total, fresh.length, hits.length, Date.now() - started],
    );
  });

  log(`${fresh.length} decision(s) in the window. ${hits.length} touch a rule we assert, and are queued for a human.`);
  for (const h of hits) log(`  ⚖️  ${h.touches.map((t) => t.rule).join(', ')}: ${h.title.slice(0, 90)}`);
}

if (process.argv[1] && process.argv[1].endsWith('tribunal.mjs')) {
  main().catch(async (e) => {
    console.error('[khoji:tribunal] FAILED:', e.message);
    if (DB_URL && !DRY) {
      try {
        await withDb((db) => db.query(
          `insert into public.khoji_runs
             (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
           values ('tribunal', null, 0, 0, 0, 0, 0, '{}', null, false)`,
        ));
      } catch { /* the heartbeat goes stale and the light reddens on its own */ }
    }
    process.exit(1);
  });
}
