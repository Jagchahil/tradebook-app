// THE FIND CASE LAW LICENCE, ENFORCED. Three binding principles, held by code rather than by a
// promise in a comment.
//
//   node test/caselawgate.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Lekhio Ltd holds a Find Case Law transactional licence from The National Archives, ref
// CAS-341311-V2P0M2, granted on nine principles Jag signed up to. Three of them have teeth in
// code, and on 14 August 2026 a read of the pipeline found that ONE of the three was enforced,
// one was enforced only by accident, and one was not enforced at all.
//
//   A. A PERSON REVIEWS EVERY CANDIDATE CHANGE, and the pipeline only ever FLAGS.
//      🔴 BROKEN. khoji/watch.mjs's backlog select read every `needs_distillation` row with no
//      source filter. Tribunal rows sit in that queue BY DESIGN, waiting for a human. So on any
//      night with KHOJI_DISTILL on, a language model picked one up, rewrote the human authored
//      summary carrying the judge's catchwords, replaced the deliberate `confidence = null` with
//      a score of its own, and khoji/distill.mjs's triageStatus could move it to 'dismissed',
//      where no person would ever see it. A model deciding a judgment is irrelevant IS the
//      pipeline asserting, and it is the one thing principle A forbids.
//
//   B. NEVER REPRODUCE, PARAPHRASE, SUMMARISE OR COMMENT ON A JUDGMENT TO A USER.
//      🔴 NOT ENFORCED AT ALL. khoji/tribunal.mjs stores up to 800 characters of the judge's own
//      catchwords in knowledge_items.summary, on purpose, because the human at the desk has to
//      read them. One click of approve made that row status='reviewed', and getRelevantKnowledge
//      admits reviewed rows and hands their summary to app/api/whatsapp, app/api/ask and
//      app/api/thread, which write it into the prompt that answers a CUSTOMER. The only reason a
//      judge's words had not gone to a man asking about his van was that nobody had clicked yet.
//
//   C. NO PERSONAL DATA.
//      ⚠️ PARTLY. A tribunal decision names the appellant in its title, and the title is stored
//      raw. What this suite can hold is the part that is structural: the bytes of a judgment are
//      never fetched, never hosted, and never reach a search engine.
//
// This suite is written so that each principle fails LOUDLY if a later change breaks it, and so
// that no assertion in it can be satisfied by a comment. Every negative test runs on codeOnly().
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments are stripped before looking for anything a file must NOT contain. These files argue at
// length about what they refuse to do, and a check that cannot tell the argument from the code is
// a check that gets deleted rather than fixed.
//
// 🔴 AND THIS ONE IS URL SAFE, WHICH THE HOUSE HELPER IS NOT. The stripper used across this repo
// is `.replace(/(^|[^:])\/\/[^\n]*/g, '$1')`, and the `//` in `https://` matches it. So a line reading
//     const FCL = 'https://caselaw.nationalarchives.gov.uk/search';
// becomes `const FCL = 'https:` before any assertion sees it, and EVERY NEGATIVE GUARD IN THIS
// REPO THAT HUNTS FOR A FORBIDDEN URL IS BLIND TO IT. That was found on 14 August 2026 by a
// sabotage that added exactly that line and stayed green. A comment marker is only a comment
// marker when it is not preceded by a colon.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const C = await import(pathToFileURL(path.join(root, 'khoji/caselaw.mjs')).href);
const D = await import(pathToFileURL(path.join(root, 'khoji/distill.mjs')).href);

const srcCaselaw = read('khoji/caselaw.mjs');
const srcWatch = read('khoji/watch.mjs');
const srcTribunal = read('khoji/tribunal.mjs');
const srcLawSources = read('lib/lawsources.ts');
const supa = read('lib/supabase.ts');

console.log('\nthe find case law licence: three binding principles, held by code');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 0. ONE DEFINITION OF WHAT A CASELAW ROW IS, ACROSS TWO LANGUAGES.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// khoji is .mjs under bare node on a Mac mini. lib/ is TypeScript compiled by Next. Neither can
// import the other, so the constant exists twice on purpose. If the two ever drift, the .mjs side
// would keep a row out of the distiller while the .ts side let it through to a customer, or the
// reverse, and either way the licence is broken by a typo. So they are compared byte for byte.
{
  const fromMjs = (srcCaselaw.match(/export const CASELAW_SOURCE_NAME = '([^']*)'/) || [])[1];
  const fromTs = (srcLawSources.match(/export const CASELAW_SOURCE_NAME = '([^']*)'/) || [])[1];
  ok('the marker is declared in khoji/caselaw.mjs', typeof fromMjs === 'string' && fromMjs.length > 10);
  ok('the marker is declared in lib/lawsources.ts', typeof fromTs === 'string' && fromTs.length > 10);
  ok('🔴 THE TWO LANGUAGES AGREE ON WHAT A CASELAW ROW IS, BYTE FOR BYTE', fromMjs === fromTs);
  // ⚠️ ANCHORED ON THE INSERT, NOT THE IMPORT. An import is not a wiring: reverting the value to a
  // hard coded literal leaves `import { CASELAW_SOURCE_NAME }` at the top of the file, and a check
  // that only looked for the name stayed green over a writer that had stopped using it.
  const insert = codeOnly(srcTribunal).slice(codeOnly(srcTribunal).indexOf('insert into public.knowledge_items'));
  ok('🔴 THE WRITER USES THE SHARED CONSTANT AT THE INSERT, not a literal of its own',
    /CASELAW_SOURCE_NAME,/.test(insert.slice(0, 1200))
    && !/'Tax tribunal decision \(GOV\.UK/.test(insert.slice(0, 1200)));
}

// The predicate itself, on fixtures.
ok('a row marked by source_name is caselaw',
  C.isCaselawRow({ source_name: C.CASELAW_SOURCE_NAME }) === true);
ok('a row marked only in raw is caselaw, so a display string cannot un-mark it',
  C.isCaselawRow({ source_name: 'something else', raw: { tribunal: true } }) === true);
ok('a raw that arrived as a json string still reads as caselaw',
  C.isCaselawRow({ raw: '{"tribunal":true,"published":"2026-08-01"}' }) === true);
ok('an ordinary GOV.UK row is not caselaw',
  C.isCaselawRow({ source_name: 'GOV.UK', raw: { tribunal: false } }) === false);
ok('rubbish is not caselaw', C.isCaselawRow(null) === false && C.isCaselawRow('x') === false);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A. A PERSON REVIEWS EVERY CANDIDATE. THE PIPELINE ONLY FLAGS.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const code = codeOnly(srcWatch);
  ok('🔴 THE BACKLOG DISTILLER EXCLUDES CASELAW ROWS AT THE DATABASE',
    code.includes('CASELAW_SQL_EXCLUSION'));
  // 🔴 THE SHAPE OF THE ORIGINAL DEFECT, NAMED SO IT CANNOT COME BACK. A select on
  // needs_distillation with no exclusion beside it is exactly what shipped.
  // ⚠️ SELECTS ONLY. The word also appears as a display label on an Obsidian note, which is
  // not a read of the queue, and a check that could not tell the two apart failed on correct code.
  const queries = code.split('db.query(').slice(1)
    .map((chunk) => chunk.slice(0, 500))
    .filter((q) => /select/i.test(q) && /needs_distillation/.test(q));
  const unguarded = queries.filter((q) => !/CASELAW_SQL_EXCLUSION/.test(q));
  ok('🔴 EVERY SELECT ON THE APPROVAL QUEUE EXCLUDES CASELAW: ' + queries.length
    + ' select(s), ' + unguarded.length + ' unguarded', queries.length > 0 && unguarded.length === 0);
}
{
  // triageStatus is defence in depth: even handed a caselaw row directly, it may not bin it and
  // may not mark it judged. Run on the real function, not on its source.
  const binnable = { affects: 'not relevant to anybody', confidence: 0.1, summary: 'x' };
  ok('🔴 A JUDGMENT CAN NEVER BE AUTO DISMISSED, whatever a model says about it',
    D.triageStatus({ source_name: C.CASELAW_SOURCE_NAME }, binnable) === 'needs_distillation');
  ok('🔴 and it can never be marked distilled, because no model may judge it',
    D.triageStatus({ raw: { tribunal: true } }, { affects: 'everyone', confidence: 0.99 }) === 'needs_distillation');
  // The existing exemptions must still work, or this fix broke the thing it sits next to.
  ok('a watched rates page is still never binned',
    D.triageStatus({ source_url: 'https://www.gov.uk/rates#mileage' }, binnable) === 'distilled');
  ok('an HMRC manual is still never binned',
    D.triageStatus({ source_url: 'https://www.gov.uk/hmrc-internal-manuals/x' }, binnable) === 'distilled');
  ok('and ordinary rubbish is still binned, so the exemption did not swallow the rule',
    D.triageStatus({ source_url: 'https://www.gov.uk/news/x' }, binnable) === 'dismissed');
}
{
  const code = codeOnly(srcTribunal);
  ok('🔴 the writer still queues a hit for a human and touches no engine',
    /'needs_distillation'/.test(code) && !/fact_overrides|proposed_fact/.test(code));
  ok('🔴 and no model is invoked anywhere on the tribunal path',
    !/anthropic|claude|distill\(/i.test(code));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B. A JUDGMENT NEVER REACHES A USER.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // getRelevantKnowledge is the ONE read whose output is interpolated into a customer's answer.
  const fn = supa.slice(supa.indexOf('knowledge_items?status=in.(reviewed,verbatim)'));
  const window = fn.slice(0, 2000);
  ok('🔴 THE CUSTOMER FACING READ FILTERS CASELAW OUT AT THE DATABASE',
    window.includes('CASELAW_NOT_FILTER'));
  ok('🔴 AND REFUSES IT AGAIN IN CODE, in case a row is marked only in raw',
    window.includes('isCaselawKnowledgeRow'));
  ok('the columns needed to recognise a judgment are actually selected',
    /select=[^`&]*source_name/.test(window) && /select=[^`&]*raw/.test(window));
}
{
  // Every lane that writes knowledge into a customer's prompt. If a new one appears, it must go
  // through the one filtered reader rather than querying the table itself.
  const lanes = ['app/api/whatsapp/route.ts', 'app/api/ask/route.ts', 'app/api/thread/route.ts'];
  const rogue = lanes.filter((f) => {
    if (!existsSync(path.join(root, f))) return false;
    const code = codeOnly(read(f));
    // It may CALL the filtered reader. It may not query knowledge_items itself.
    return /knowledge_items/.test(code);
  });
  ok('🔴 NO CUSTOMER LANE QUERIES knowledge_items ITSELF, they all go through the one reader: '
    + (rogue.join(', ') || 'none'), rogue.length === 0);
}
{
  // The whole app tree, not just the three lanes that exist today. This is the assertion that
  // survives somebody adding a fourth surface in six months.
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  walk('app');
  const leaky = files.filter((f) => /knowledge_items/.test(codeOnly(read(f))));
  ok('🔴 NOTHING UNDER app/ READS knowledge_items DIRECTLY: ' + (leaky.join(', ') || 'none'),
    leaky.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B2. THE TWO STATEMENTS THE EXECUTED LICENCE REQUIRES, WORD FOR WORD.
//
// The licence signed on 14 August 2026 is stricter than the application's nine principles, and
// these are hard obligations rather than good practice:
//
//   "An acknowledgement in the form specified must appear in a prominent location and in a form
//   approved by the Licensor."
//
//   Restrictions (b): the Re-user "must state in a prominent location and in a form approved by
//   the Licensor that the Licensed Material only partially represents the activities of the
//   courts and tribunals".
//
// 🔴 THE ACKNOWLEDGEMENT CONTAINS AN EN DASH AND THAT IS THE ONE PLACE IN THIS PRODUCT WHERE ONE
// BELONGS. The house rule bans en dashes everywhere. The licence specifies the form of words. So
// the dash is asserted PRESENT here: a well meaning sweep that "fixes" it fails the build rather
// than quietly putting us in breach.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const EN_DASH = '\u2013';
  ok('the acknowledgement is declared', typeof C.TNA_ACKNOWLEDGEMENT === 'string');
  ok('🔴 IT IS THE LICENSOR\'S EXACT FORM OF WORDS',
    C.TNA_ACKNOWLEDGEMENT
      === 'Crown copyright material reproduced by permission of The National Archives. '
        + 'The contents of the judgment can be used under the Open Justice ' + EN_DASH + ' Licence.');
  ok('🔴 AND THE EN DASH IS PRESENT, because the licence specifies the form and the house rule does not win here',
    C.TNA_ACKNOWLEDGEMENT.includes(EN_DASH));
  ok('the partial representation statement is declared and says what the licence requires',
    typeof C.TNA_PARTIAL_REPRESENTATION === 'string'
    && /only partially represent/i.test(C.TNA_PARTIAL_REPRESENTATION)
    && /courts and tribunals/i.test(C.TNA_PARTIAL_REPRESENTATION));
  // Both languages again, so a surface written in TypeScript cannot show a reworded version.
  const ackTs = (srcLawSources.match(/export const TNA_ACKNOWLEDGEMENT =([\s\S]*?);/) || [])[1] || '';
  ok('🔴 the TypeScript side carries the SAME acknowledgement, byte for byte',
    ackTs.includes('Crown copyright material reproduced by permission of The National Archives.')
    && ackTs.includes('Open Justice')
    && ackTs.includes('\\u2013'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B3. PERSONAL DATA IS NOT LICENSED, SO IT IS NEVER STORED.
//
// The Exclusions clause: this licence does not cover "personal data contained in the Licensed
// Material", and "this Licence is not a data sharing agreement for personal data". And principle
// 6 of the application, in Jag's own words: "We do not store, enrich, index or infer personal
// data about any individual named in a decision."
//
// The code did the opposite until 14 August 2026. A tribunal title IS the parties.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  ok('the case reference survives, because it identifies a public record and is not personal data',
    C.stripParties('UT-2024-000141 CATS NORTH SEA v HMRC').includes('UT-2024-000141'));
  ok('the neutral citation survives',
    C.stripParties('Smith v The Commissioners for HMRC [2024] UKUT 123 (TCC)').includes('[2024] UKUT 123 (TCC)'));
  ok('🔴 AND THE NAMES DO NOT',
    !/CATS NORTH SEA/.test(C.stripParties('UT-2024-000141 CATS NORTH SEA v HMRC'))
    && !/Smith/.test(C.stripParties('Smith v The Commissioners for HMRC [2024] UKUT 123 (TCC)')));
  ok('a hyphenated -v- names parties too',
    !/Patel/.test(C.stripParties('J Patel -v- HMRC, CAPITAL ALLOWANCES')));
  ok('subject matter with no parties in it is left alone',
    C.stripParties('CAPITAL ALLOWANCES: whether a van is a car') === 'CAPITAL ALLOWANCES: whether a van is a car');
  ok('stripping twice changes nothing',
    C.stripParties(C.stripParties('Smith v HMRC')) === C.stripParties('Smith v HMRC'));
  // ⚠️ A /g REGEX CARRIES lastIndex BETWEEN CALLS. namesParties builds a fresh one each time,
  // because a shared one would answer differently on every other call and read as flakiness.
  ok('🔴 the detector is not stateful, so it answers the same twice running',
    C.namesParties('Smith v HMRC') === true && C.namesParties('Smith v HMRC') === true);
  ok('and it says a stripped string is clean',
    C.namesParties(C.stripParties('Smith v The Commissioners for HMRC')) === false);
}
{
  // 🔴 THE WRITER MUST STRIP BEFORE IT STORES. Anchored on the call inside the row it builds,
  // not on the import, because an import is not a wiring.
  const code = codeOnly(srcTribunal);
  const hits = code.slice(code.indexOf('hits.push('), code.indexOf('hits.push(') + 600);
  ok('🔴 THE TITLE IS STRIPPED BEFORE IT IS KEPT', /title: stripParties\(/.test(hits));
  ok('🔴 AND SO ARE THE CATCHWORDS', /catchwords: stripParties\(/.test(hits));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C. NO JUDGMENT IS FETCHED, HOSTED, OR INDEXED.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const code = codeOnly(srcTribunal);
  ok('🔴 THE JUDGMENT ITSELF IS NEVER FETCHED. Catchwords decide whether a HUMAN reads it',
    !/attachment|\.pdf|fetchJudgment|downloadAll/i.test(code));
  ok('🔴 and the Find Case Law API is not reached from the tribunal watcher',
    !/nationalarchives/i.test(code));
  ok('the source is GOV.UK\'s own Open Government Licence feed',
    /filter_format', 'tax_tribunal_decision/.test(code));
}
{
  // Hosting. lawwatch stores a hash and discards the body, which is what keeps us from holding a
  // copy of anybody's record.
  const code = codeOnly(read('khoji/lawwatch.mjs'));
  // ⚠️ "body_hash" CONTAINS THE WORD "body", and the first version of this refused it. The
  // claim is that what is stored is a hash OF the body, never the body, so it is pointed at the
  // value actually passed and at the column list.
  const ins = code.indexOf('insert into public.khoji_law');
  ok('🔴 the law watcher stores a HASH and never the body of a record',
    /createHash/.test(code) && /hashOf\(body\)/.test(code) && /body_hash/.test(code)
    && !/[(,]\s*body\s*[,)]/.test(code.slice(ins, ins + 400)));
}
{
  // Indexing. knowledge_items is served only from session gated routes, and robots disallows the
  // API. If a public route ever serves it, that is a search engine indexing judgment content.
  const robots = read('app/robots.ts');
  ok('robots disallows the API surface', /\/api\//.test(robots));
  const publicJson = ['app/rules.json/route.ts', 'app/facts.json/route.ts'];
  const leaky = publicJson.filter((f) => existsSync(path.join(root, f)) && /knowledge_items/.test(codeOnly(read(f))));
  ok('🔴 NO PUBLIC JSON ENDPOINT IS BUILT FROM knowledge_items: ' + (leaky.join(', ') || 'none'),
    leaky.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// D. THE SUITES CANNOT VANISH.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ khoji-tribunal and khoji-lawwatch are wrapped in existsSync in test/run-all.mjs, so renaming
// or deleting either file removes the suite from the run and `npm test` still exits 0. A licence
// guard that disappears quietly is worse than no guard, because the green tick is a claim.
{
  const runAll = read('test/run-all.mjs');
  const named = ['tribunaltest.mjs', 'lawwatchtest.mjs', 'caselaw.mjs'];
  const missing = named.filter((f) => !existsSync(path.join(root, 'khoji', f)));
  ok('🔴 EVERY FILE THE LICENCE GUARDS DEPEND ON IS PRESENT: ' + (missing.join(', ') || 'all present'),
    missing.length === 0);
  ok('run-all knows about the tribunal suite', runAll.includes('tribunaltest.mjs'));
  ok('run-all knows about the lawwatch suite', runAll.includes('lawwatchtest.mjs'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// E. THE WRITING RULES.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // Written as \u escapes on purpose: a literal en or em dash in the detector would make this
  // suite fail on its own source, which is a test that can never be run. Same trap jobdiary hit.
  const DASH = /[\u2013\u2014]/;
  // ⚠️ khoji/caselaw.mjs IS EXEMPT AND THE EXEMPTION IS NAMED. It carries the Licensor's approved
  // acknowledgement, which contains an en dash, written as a \\u2013 escape so the file has no
  // literal dash in it while the STRING it exports does. The assertion above proves the string
  // has the dash; this one proves the file has no OTHER one.
  //
  // ⚠️ WIDENED 14 AUGUST 2026, AND IT FOUND TWO. The sweep used to look at the two files this
  // fix created, which is the narrowest possible reading of "anywhere". Pointing it at the whole
  // caselaw pipeline turned up an em dash in the TITLE khoji/tribunal.mjs writes into the desk
  // queue, and one in a comment in khoji/watch.mjs. Both had shipped. A rule only holds where it
  // is pointed, so it is now pointed at every file in the pipeline.
  //
  // khoji/tribunaltest.mjs IS EXEMPT AND THE EXEMPTION IS NAMED. Its fixtures are real catchwords
  // lifted from real decisions, and the judiciary writes en dashes. Correcting a quotation of the
  // input would make the fixture stop representing the thing it exists to represent.
  const files = {
    'khoji/caselaw.mjs': srcCaselaw,
    'khoji/tribunal.mjs': srcTribunal,
    'khoji/watch.mjs': read('khoji/watch.mjs'),
    'khoji/distill.mjs': read('khoji/distill.mjs'),
    'lib/lawsources.ts': srcLawSources,
    'test/caselawgate.test.mjs': read('test/caselawgate.test.mjs'),
    'test/sabotage-caselaw.mjs': read('test/sabotage-caselaw.mjs'),
  };
  ok('the sweep covers the whole pipeline, not just the two files this fix created',
    Object.keys(files).length === 7);
  const bad = Object.entries(files).filter(([, src]) => DASH.test(src)).map(([n]) => n);
  ok('🔴 no em dash and no en dash in anything this fix shipped: ' + (bad.join(', ') || 'none'),
    bad.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
