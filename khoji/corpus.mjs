// Khoji's corpus checker. Phase 3: the depth corpus, and the differ applied to PROSE.
//
//   node corpus.mjs --dry-run   check every citation, print a report, write nothing
//   node corpus.mjs             check, store the verbatim HMRC text, raise incidents
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS IS FOR
//
// lib/taxrules.ts holds 24 rules that tell a self-employed man what he may put on his tax return.
// "No, you cannot claim everyday clothes." That rule is Mallalieu v Drummond, a House of Lords case
// from 1983, and until today we asserted it with no source at all. We were telling a man what to
// sign his name to on our own authority, and our authority is nothing.
//
// Each rule now names an HMRC page AND THE EXACT SENTENCE it rests on. This checks, every night,
// that the sentence is still there, word for word.
//
//     diff.mjs    we say 0.55, GOV.UK says 0.55            -> subtract
//     corpus.mjs  we say 'no',  BIM37910 says "disallow"   -> is the sentence still on the page
//
// HMRC rewrites these manuals constantly (BIM37910 was updated in March 2026). The day our
// sentence changes or disappears, the ground has moved under a rule a man is relying on, and
// nothing else in the world would tell us.
//
// ---------------------------------------------------------------------------------------------
// IT IS ALSO A TRAP FOR THE AUTHOR, AND THAT IS THE HALF PEOPLE MISS
//
// If someone cites a page that exists but does NOT say what they claimed, the quote is not found
// and this fails loudly. A model, or a tired human, writing a plausible-looking "BIM45012" from
// memory produces a CONFIDENT FALSE AUTHORITY, which is strictly worse than no citation: it is a
// wrong answer wearing HMRC's uniform. Here, an invented citation is an incident, not a footnote.
//
// The rule from three separate near misses last night holds: ARITHMETIC AND PROVENANCE DECIDE. THE
// MODEL ONLY DESCRIBES. Nothing here asks anybody's opinion. The sentence is on the page or it is
// not.
//
// ---------------------------------------------------------------------------------------------
// WHY WE STORE IT VERBATIM AND NEVER SUMMARISE IT
//
// The review gate (only `reviewed` rows reach Rakha) exists to stop OUR CLAIMS being wrong. A
// verbatim quotation of HMRC, with its URL, is not our claim. There is nothing to approve, because
// we have not asserted anything: we have pointed. So verbatim rows carry status 'verbatim' and are
// readable by Rakha without a human approving each one. That is not a hole in the gate. It is the
// gate working: the thing it guards against, a summariser being wrong, cannot happen if nothing is
// summarised.
//
// Every page here is Crown copyright under the OPEN GOVERNMENT LICENCE v3.0, which permits copying
// and publishing with attribution. Quoting HMRC verbatim is licensed.
//
// SAFETY RAIL: a row is only ever written with status 'verbatim' if its URL is gov.uk. If that
// check ever fails, something has gone very wrong and we would be about to publish a stranger's
// words under HMRC's authority.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTags } from './watch.mjs';

const DRY = process.argv.includes('--dry-run');
const DB_URL = process.env.KHOJI_DB_URL || '';
const RULES_URL =
  (process.argv.find((a) => a.startsWith('--rules=')) || '').slice(8) ||
  process.env.KHOJI_RULES_URL ||
  'https://lekhio.app/rules.json';

const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';

function log(...a) { console.log('[khoji:corpus]', ...a); }

// Normalise before comparing. GOV.UK serves curly apostrophes, non-breaking spaces and entities,
// and the same sentence can arrive three different ways. We are checking whether HMRC still SAYS
// this, not whether their typesetter changed a glyph. Anything stricter cries wolf; anything looser
// stops being a quotation check.
export function normalise(s) {
  return (s || '')
    .replace(/[‘’ʼ']/g, "'")     // curly and modifier apostrophes
    .replace(/[“”]/g, '"')            // curly quotes
    .replace(/[‐-―−]/g, '-')     // dashes and minus
    .replace(/ /g, ' ')                    // non-breaking space
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    // THE SPACE THAT HTML STRIPPING INVENTS. A WHOLE CLASS OF PERMANENT FALSE ALARM.
    //
    // stripTags replaces every tag with a space. So `<a>simplified expenses</a>.` comes out as
    // "simplified expenses ." with a space before the full stop. Our quote, copied CORRECTLY off
    // the page, says "simplified expenses." and never matches.
    //
    // Not hypothetical: it is exactly how the `car` citation failed on the first live run, and it
    // would have failed every night forever on a quote that was word-for-word right. Worse, it gets
    // MORE likely the more carefully you cite, because HMRC links precisely the phrases that carry
    // the meaning: "capital allowances", "simplified expenses", "cash basis accounting".
    //
    // A permanent false alarm is the exact thing this system exists to avoid. You mute it, and then
    // you have no alarm AND you believe you have one. A space in front of a full stop is
    // typesetting. It is not a change in the law.
    .replace(/\s+([.,;:!?)])/g, '$1')
    .trim()
    .toLowerCase();
}

// WHERE, EXACTLY, DID OUR QUOTE STOP BEING TRUE?
//
// "The sentence is not on the page" is an alarm that makes you go and read the page yourself, and
// the person who sees it at 6am will not bother. So we find the LONGEST PREFIX of our quote that IS
// still on the page, and print HMRC's real words from that point on.
//
// That turns "something is wrong somewhere" into "you wrote X, HMRC says Y, the divergence starts
// at word eleven". One glance and the fix is obvious. An alarm should hand you the answer, not a
// research task.
//
// It found its first real bug immediately: a `car` quote copied out of a markdown RENDERING of the
// page rather than the HTML the mini actually fetches.
export function whereItDiverges(quote, pageText) {
  const hay = normalise(pageText);
  const words = normalise(quote).split(' ');
  let matched = 0;
  for (let n = words.length; n >= 4; n--) {
    if (hay.includes(words.slice(0, n).join(' '))) { matched = n; break; }
  }
  if (!matched) return { matchedWords: 0, theirs: null };
  const prefix = words.slice(0, matched).join(' ');
  const at = hay.indexOf(prefix);
  return {
    matchedWords: matched,
    ours: words.slice(matched).join(' ') || '(nothing, our quote ends here)',
    theirs: pageText.slice(0, 0) || null, // placeholder, replaced below
    theirsNormalised: hay.slice(at, at + prefix.length + 160),
  };
}

// Exactly one of: cited | quote_missing | fetch_failed | uncited.
// `quote_missing` is the loud one. It means either HMRC rewrote the page, or we cited something
// that never said what we claimed. Both are incidents and neither is "probably fine".
export function checkSource(source, pageText) {
  if (!/^https:\/\/www\.gov\.uk\//.test(source.url)) {
    return { ...source, status: 'quote_missing',
             detail: `the URL is not gov.uk. Nothing else is an authority: ${source.url}` };
  }
  const hay = normalise(pageText);
  const needle = normalise(source.quote);
  if (!needle || needle.length < 20) {
    return { ...source, status: 'quote_missing',
             detail: 'the quote is too short to be an anchor. A fragment can survive a rewrite that reverses its meaning.' };
  }
  if (hay.includes(needle)) return { ...source, status: 'cited', detail: null };

  // Not there. Say WHERE it stops being true, so the fix takes one glance and not an afternoon.
  const d = whereItDiverges(source.quote, pageText);
  const detail = d.matchedWords
    ? `the sentence is NOT on the page. Our first ${d.matchedWords} words still match. `
      + `HMRC actually says: "...${d.theirsNormalised}..." `
      + `We claim it continues: "${d.ours}"`
    : 'the sentence is NOT on the page, and not even its opening words are. Either HMRC rewrote it, '
      + 'or we cited something that never said this at all.';
  return { ...source, status: 'quote_missing', detail, diverged: d };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// The body of an HMRC page, stripped. Everything, furniture included.
export function pageBody(html) {
  return stripTags(html).slice(0, 40000);
}

// THE PASSAGE THAT AUTHORISES THE RULE. NOT THE PAGE.
//
// The first version stored stripTags(page).slice(0, 12000) as the knowledge Rakha reads. Checked
// against the live database, that meant:
//
//   BIM37910: 12,000 characters stored, and the words "protective clothing" begin at CHARACTER
//   4,233. Four thousand characters of cookie banner, navigation menu and footer before the law
//   starts. And THREE rules (protective, uniform, everyday_clothes) each stored the same page in
//   full, identically.
//
// Six of those go into the context of every question a man asks: roughly 72,000 characters, call it
// 18,000 tokens, to answer "can I claim my boots", of which the part that authorises anything is one
// paragraph. It is expensive, it buries the signal, and it gives the model a fair chance of quoting
// GOV.UK's cookie policy to a plasterer.
//
// We already know the exact sentence. So take the passage AROUND it. Each rule now stores the few
// hundred words that authorise THAT rule, which means the three BIM37910 rules stop being three
// copies of one page and become three different passages: the one that disallows, the one that
// allows, and the case that decided it.
//
// Doc 103, applied to a prompt: what did we take out to make room for it.
// before/after: LOOK FORWARD, NOT BACK. The authorising sentence and what follows it is the law.
// What precedes it, on a GOV.UK page, is as likely to be a cookie banner as a statute. 350 back is
// enough to catch the section heading (on BIM37910 it catches "S34 Income Tax (Trading and Other
// Income) Act 2005", which is the statute) without reaching the furniture.
export function quoteWindow(text, quote, before = 350, after = 1500) {
  // Find the quote in the ORIGINAL stripped text (not the normalised one, whose indices do not map
  // back). Build a pattern from its words: flexible whitespace, and apostrophes that may be curly.
  const words = quote.trim().split(/\s+/).slice(0, 10).map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’‘]/g, "['’‘]"));
  if (!words.length) return text.slice(0, 1800);
  const re = new RegExp(words.join('[\\s]*'), 'i');
  const m = re.exec(text);
  if (!m) return text.slice(0, 1800); // cannot locate it: fall back, and the checker already shouted
  const at = m.index;
  const start = Math.max(0, at - before);
  const end = Math.min(text.length, at + m[0].length + after);
  const head = start > 0 ? '... ' : '';
  const tail = end < text.length ? ' ...' : '';
  return `${head}${text.slice(start, end).trim()}${tail}`;
}

export async function checkRules(rules, fetcher = fetchText) {
  const pages = new Map();
  const out = [];
  for (const rule of rules) {
    if (!rule.sources || rule.sources.length === 0) {
      out.push({ key: rule.key, title: rule.title, verdict: rule.verdict, status: 'uncited',
                 detail: 'we assert this on our own authority, and our authority is nothing' });
      continue;
    }
    for (const source of rule.sources) {
      if (!pages.has(source.url)) {
        try { pages.set(source.url, await fetcher(source.url)); }
        catch (err) { pages.set(source.url, { fetchError: err.message }); }
      }
      const page = pages.get(source.url);
      if (page && page.fetchError) {
        out.push({ key: rule.key, title: rule.title, verdict: rule.verdict, ...source,
                   status: 'fetch_failed', detail: `could not fetch the page: ${page.fetchError}` });
        continue;
      }
      const text = pageBody(page);
      const checked = checkSource(source, text);
      out.push({ key: rule.key, title: rule.title, verdict: rule.verdict, ...checked,
                 // The passage that authorises THIS rule, not the whole page with its cookie banner.
                 body: checked.status === 'cited' ? quoteWindow(text, source.quote) : null });
    }
  }
  return out;
}

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function main() {
  const url = `${RULES_URL}${RULES_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;
  log(`reading the claim rules from ${RULES_URL} (cache busted)`);
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'cache-control': 'no-cache' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`could not read the rules: HTTP ${res.status}`);
  const meta = await res.json();

  const results = await checkRules(meta.rules || []);
  const cited = results.filter((r) => r.status === 'cited');
  const missing = results.filter((r) => r.status === 'quote_missing');
  const failed = results.filter((r) => r.status === 'fetch_failed');
  const uncited = results.filter((r) => r.status === 'uncited');

  for (const r of results) {
    const mark = { cited: 'ok    ', quote_missing: 'MISSING', fetch_failed: 'FETCH  ', uncited: 'UNCITED' }[r.status];
    log(`${mark} ${String(r.key).padEnd(18)} ${String(r.code || '').padEnd(12)} ${r.detail || r.quote?.slice(0, 60) || ''}`);
  }
  log(`${meta.cited}/${meta.total} rules cited. ${cited.length} quotes verified, ${missing.length} MISSING, ${failed.length} unfetchable, ${uncited.length} uncited.`);
  if (uncited.length) log(`  uncited: ${uncited.map((r) => r.key).join(', ')}`);

  if (DRY) { log('dry run, nothing written'); return; }
  if (!DB_URL) { console.error('[khoji:corpus] fatal: KHOJI_DB_URL is not set.'); process.exit(1); }

  await withDb(async (db) => {
    // Store the verified HMRC text, verbatim. One row per source, keyed on its URL so a re-run
    // updates rather than duplicates.
    for (const r of cited) {
      await db.query(
        `insert into public.knowledge_items
           (source_url, source_name, title, summary, affects, confidence, engine_impact, status, raw, distilled_at)
         values ($1,$2,$3,$4,$5,$6,false,'verbatim',$7,now())
         on conflict (source_url) do update set summary = excluded.summary, raw = excluded.raw, distilled_at = now()`,
        [
          `${r.url}#rule:${r.key}`,
          `HMRC ${r.code}`,
          r.title,
          // HMRC'S OWN WORDS. Not a summary. There is nothing here for a model to get wrong,
          // which is exactly why this may reach a user without a human approving each row.
          r.body,
          'UK self employed',
          1,
          { rule: r.key, verdict: r.verdict, code: r.code, quote: r.quote, authority: r.authority, url: r.url,
            licence: 'Open Government Licence v3.0' },
        ],
      );
    }

    // A quote that has vanished is an INCIDENT. The rule is still being told to users and its
    // authority has gone. Same shape as an engine drift, same self-clearing behaviour.
    for (const r of [...missing, ...failed]) {
      await db.query(
        `insert into public.knowledge_items
           (source_url, source_name, title, summary, affects, confidence, engine_impact, status, raw, distilled_at)
         values ($1,$2,$3,$4,$5,1,true,'drift',$6,now())
         on conflict (source_url) do nothing`,
        [
          `${r.url}#quote-missing:${r.key}`,
          'Khoji corpus',
          `LOST AUTHORITY: "${r.title}" no longer has HMRC behind it`,
          [
            `OUR RULE says: ${r.verdict}. "${r.title}"`,
            ``,
            `We rest that on ${r.code}:`,
            `  "${r.quote}"`,
            ``,
            `That sentence is NOT on the page any more.`,
            `  ${r.detail}`,
            ``,
            `Source: ${r.url}`,
            ``,
            `Either HMRC rewrote the page, or we cited something that never said this. Read the page,`,
            `then fix the quote in lib/rulesources.ts, or fix the RULE in lib/taxrules.ts.`,
            `A rule we tell a man to put on his tax return, with no authority behind it, is not a rule.`,
          ].join('\n'),
          'the tax rule we tell users, and therefore their return',
          { rule: r.key, code: r.code, quote: r.quote, url: r.url },
        ],
      );
    }

    // Self-clearing, like the differ. Fix the quote and tomorrow the alarm has gone out by itself.
    const healthy = cited.map((r) => r.key);
    if (healthy.length) {
      const c = await db.query(
        `update public.knowledge_items set status = 'resolved'
          where status = 'drift' and source_name = 'Khoji corpus' and raw->>'rule' = any($1)`,
        [healthy],
      );
      if (c.rowCount) log(`resolved ${c.rowCount} lost-authority incident(s) that now verify`);
    }

    log(`stored ${cited.length} verbatim HMRC pages, ${missing.length + failed.length} open incident(s)`);
  });

  if (missing.length || failed.length) process.exit(2);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => { console.error('[khoji:corpus] fatal:', err.message); process.exit(1); });
}
