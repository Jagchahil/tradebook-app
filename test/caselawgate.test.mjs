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
const srcTakedown = read('khoji/caselawtakedown.mjs');
const srcCertificate = read('khoji/caselawcertificate.mjs');
const srcLawWatch = read('khoji/lawwatch.mjs');
const srcRunSh = read('khoji/run.sh');
const pageTerms = read('app/terms/page.tsx');
const pageDesk = read('app/team/knowledge/page.tsx');
const TD = await import(pathToFileURL(path.join(root, 'khoji/caselawtakedown.mjs')).href);
const CERT = await import(pathToFileURL(path.join(root, 'khoji/caselawcertificate.mjs')).href);

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
    'khoji/caselawtakedown.mjs': srcTakedown,
    'khoji/caselawcertificate.mjs': srcCertificate,
    'app/terms/page.tsx': pageTerms,
    'app/team/knowledge/page.tsx': pageDesk,
  };
  // ⚠️ WIDENED AGAIN as the licence work grew. The list is the point: every time this fix
  // reached a new file and the sweep did not follow it, the sweep started passing over a file it
  // had never seen. The count is asserted so adding a file to the fix and forgetting the sweep
  // fails here rather than shipping.
  ok('the sweep covers every file this fix touched, not just the ones it created',
    Object.keys(files).length === 11);
  const bad = Object.entries(files).filter(([, src]) => DASH.test(src)).map(([n]) => n);
  ok('🔴 no em dash and no en dash in anything this fix shipped: ' + (bad.join(', ') || 'none'),
    bad.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// F. THE TAKEDOWN AND CURRENT VERSION TERM.
//
//   "The Re-user must use the current version of the Licensed Material and must remove any
//   Licensed Material that is no longer published or has been replaced."
//
// Every other watcher in khoji asks a forward question. This is the only one that goes back and
// asks whether a row it wrote a year ago is still true, and until 14 August 2026 it did not exist,
// so the term was a sentence in a document with nothing behind it.
//
// 🔴 THE ASSERTION THAT MATTERS MOST IN THIS FILE IS THE ONE ABOUT A 500. If a bad night on the
// mini could quietly empty the record, a licence obligation would have become a way to lose the
// desk's work. So the decision is a pure function that takes no client and opens no socket, and it
// is called here with the fault cases directly.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  ok('the takedown job exists', srcTakedown.length > 500);
  ok('the certificate job exists', srcCertificate.length > 500);

  // 🔴 A FAULT NEVER REMOVES ANYTHING. Six ways for a night to go wrong, and not one of them
  // may return a removal.
  const faults = [
    { name: 'a network error', arg: { networkError: true, status: 0 } },
    // A network error must win even when the status looks definitive, because a thrown fetch
    // leaves whatever status happened to be in the variable.
    { name: 'a network error carrying a stale 404', arg: { networkError: true, status: 404 } },
    { name: 'a 500 from the origin', arg: { status: 500 } },
    { name: 'a 502 from a proxy', arg: { status: 502 } },
    { name: 'a 429 rate limit', arg: { status: 429 } },
    { name: 'no status at all', arg: {} },
  ];
  for (const f of faults) {
    const d = TD.decide({ ...f.arg, recorded: '2026-01-01', current: null });
    ok(`🔴 ${f.name} NEVER removes licensed material`, d.action === 'none' && d.reason === 'blind');
  }

  // And the three that must.
  ok('🔴 a 404 removes it', TD.decide({ status: 404, recorded: '2026-01-01' }).action === 'redact');
  ok('🔴 a 410 removes it', TD.decide({ status: 410, recorded: '2026-01-01' }).action === 'redact');
  ok('🔴 a withdrawal notice removes it',
    TD.decide({ status: 200, withdrawn: true, recorded: '2026-01-01', current: '2026-01-01' }).action === 'redact');
  ok('🔴 a source revised since we recorded it removes the superseded copy',
    TD.decide({ status: 200, recorded: '2026-01-01', current: '2026-06-01' }).action === 'redact');

  // ⚠️ A FIRST SIGHT IS A BASELINE, NOT AN ALARM. The same rule khoji/lawwatch.mjs holds. A row
  // written before this job existed has no stamp, and calling that "revised" would redact the whole
  // record on the first run.
  ok('a row with no recorded stamp is baselined, not removed',
    TD.decide({ status: 200, recorded: null, current: '2026-06-01' }).action === 'stamp');
  ok('a source older than our stamp is left alone',
    TD.decide({ status: 200, recorded: '2026-06-01', current: '2026-01-01' }).action === 'none');
  ok('an unparseable stamp is not a revision',
    TD.decide({ status: 200, recorded: 'not a date', current: 'also not' }).action === 'stamp');

  // ⚠️ THIS PAIR WAS REWRITTEN, NOT DELETED, AND THE DIFFERENCE MATTERS.
  // It used to assert that tribunal.mjs stamped source_updated_at and that the takedown job read
  // it back. That was the wrong design: the writer takes its timestamp from the SEARCH endpoint
  // and the takedown job reads the CONTENT API, so it compared two different fields from two
  // different endpoints. They agreed on the rows in the record, which is exactly why it looked
  // correct. The takedown job now stamps and reads its own, and section L holds it to that. What
  // survives here is the rule the pair existed for: the writer must not leave a duplicate
  // timestamp lying about for somebody to compare the wrong thing against.
  ok('🔴 tribunal.mjs keeps ONE source timestamp, not two that can be confused',
    !/source_updated_at/.test(codeOnly(srcTribunal))
    && /published: h\.published/.test(codeOnly(srcTribunal)));

  // A URL we cannot parse is blind, never gone.
  ok('a URL we cannot parse yields no path, so the row is left alone',
    TD.contentPathFor('not a url') === null);
  ok('a URL on a host that is not gov.uk yields no path',
    TD.contentPathFor('https://example.com/thing') === null);
  ok('a gov.uk decision URL yields its path',
    TD.contentPathFor('https://www.gov.uk/tax-and-chancery-tribunal-decisions/x') === '/tax-and-chancery-tribunal-decisions/x');

  // 🔴 IT REDACTS, IT DOES NOT DELETE, AND THE REASON IS RE-INGEST.
  // source_url is the conflict key. Hard delete the row and tribunal.mjs files the withdrawn
  // decision again on the very next run, so the job would remove material at 05:20 and put it back
  // at 05:15 the following morning, reporting success both times.
  const tdCode = codeOnly(srcTakedown);
  ok('🔴 THE TAKEDOWN JOB NEVER DELETES A knowledge_items ROW',
    !/delete\s+from\s+public\.knowledge_items/i.test(tdCode));
  ok('it updates instead', /update public\.knowledge_items/.test(tdCode));
  ok('and tribunal.mjs still relies on the conflict key that the tombstone preserves',
    /on conflict \(source_url\) do nothing/.test(codeOnly(srcTribunal)));

  // A run that could not read something exits loud. Not knowing is not the same as being fine.
  ok('🔴 the job exits non-zero when anything was unreadable',
    /process\.exit\(blind > 0 \? 1 : 0\)/.test(tdCode));

  // 🔴 AND IT ACTUALLY RUNS. A job nobody calls discharges nothing.
  //
  // ⚠️ READ THROUGH A SHELL COMMENT STRIPPER, AND THE FIRST VERSION DID NOT. It tested the
  // raw file for `node caselawtakedown.mjs`, and a sabotage that commented the line out to
  // `# node caselawtakedown.mjs` STAYED GREEN, because the string is still there inside the
  // comment. codeOnly() strips `//` and `/* */`, which is the wrong language for a shell script.
  // Exactly the codeOnly blindness this fix was already about, in a file nobody thought to check.
  const shellCode = srcRunSh.replace(/(^|\n)[ \t]*#[^\n]*/g, '$1');
  ok('🔴 THE NIGHTLY RUN CALLS THE TAKEDOWN JOB, on a line that is not commented out',
    /node caselawtakedown\.mjs/.test(shellCode));
  ok('and its exit code is captured', /takedown_rc=\$\?/.test(shellCode));
  ok('and its exit code is not swallowed',
    /if \[ "\$takedown_rc" -ne 0 \]; then exit "\$takedown_rc"; fi/.test(shellCode));
  // The stripper has to actually strip, or this is just the old check wearing a hat.
  ok('the shell comment stripper removes a commented line',
    !/node caselawtakedown\.mjs/.test('# node caselawtakedown.mjs "$@"'.replace(/(^|\n)[ \t]*#[^\n]*/g, '$1')));

  // Both jobs must agree with the rest of the product about what a caselaw row IS. They take the
  // inclusion from the shared exclusion rather than writing their own SQL.
  ok('the takedown job derives its row test from the shared exclusion',
    /CASELAW_SQL_INCLUSION = 'not ' \+ CASELAW_SQL_EXCLUSION/.test(tdCode));
  ok('the certificate derives its row test from the shared exclusion',
    /CASELAW_SQL_INCLUSION = 'not ' \+ CASELAW_SQL_EXCLUSION/.test(codeOnly(srcCertificate)));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// G. THE CERTIFICATE OF ERASURE.
//
//   On termination the Re-user must erase the Licensed Material and CERTIFY that erasure.
//
// A certificate is a statement of fact signed by a person, and it is worthless if that person is
// guessing. On the day it is asked for, the person signing will be Jag, under time pressure, years
// after this was written, with no memory of where any of it ended up.
//
// 🔴 SO THE CERTIFICATE IS BUILT FROM A RE-READ AND NEVER FROM WHAT THE ERASURE BELIEVES IT DID.
// Exactly the rule the persona erasures are held to: rowCount is a claim, a second SELECT is
// evidence. A certificate that prints whatever happened is a lie with a letterhead.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const certCode = codeOnly(srcCertificate);

  ok('every place licensed material can live is enumerated in one list',
    Array.isArray(CERT.PLACES) && CERT.PLACES.length >= 4);
  ok('the prose store is named and is erasable',
    CERT.PLACES.some((p) => p.table === 'knowledge_items' && p.erase === true && p.holds === 'prose'));
  ok('the hash store is named and is erasable anyway',
    CERT.PLACES.some((p) => p.table === 'khoji_law' && p.erase === true));
  // ⚠️ AND THE TWO THAT ARE HONESTLY NOT ERASABLE ARE NAMED WITH THE REASON, rather than left
  // out. Erasing our own run history would destroy the audit trail proving the removals happened.
  ok('the audit trail is enumerated and explicitly NOT erased',
    CERT.PLACES.some((p) => p.table === 'khoji_runs' && p.erase === false && /audit/i.test(p.note)));
  ok('every place carries a note explaining what it holds',
    CERT.PLACES.every((p) => typeof p.note === 'string' && p.note.length > 20));

  // 🔴 THERE IS NO PARTIAL CERTIFICATE.
  ok('🔴 one remaining row means NOT clean', CERT.isClean({ knowledge_items: 1, khoji_law: 0 }) === false);
  ok('🔴 one remaining hash means NOT clean', CERT.isClean({ knowledge_items: 0, khoji_law: 1 }) === false);
  ok('all zero means clean', CERT.isClean({ knowledge_items: 0, khoji_law: 0 }) === true);
  // A missing count is not a zero. An absent key must not read as erased.
  // ⚠️ THIS ONE CAUGHT A REAL DEFECT AND ONLY BECAUSE IT WAS REWRITTEN. As first written it
  // read `isClean({knowledge_items: 0}) === true || isClean({}) === true`, which is an assertion
  // that cannot fail. Pointed at the actual question it exposed `?? 0` inside isClean: a place
  // that had never been counted certified as erased.
  ok('🔴 A PLACE THAT WAS NEVER COUNTED DOES NOT READ AS ERASED',
    CERT.isClean({ knowledge_items: 0 }) === false && CERT.isClean({}) === false);
  ok('an undefined count is not clean either',
    CERT.isClean({ knowledge_items: 0, khoji_law: undefined }) === false);
  ok('a tally that is not an object at all is not clean',
    CERT.isClean(null) === false && CERT.isClean(undefined) === false);

  // The count uses the SAME predicate the takedown job clears against, or the certificate would
  // certify a state the takedown job never reaches.
  const held = { source_name: C.CASELAW_SOURCE_NAME, title: 'A decision', summary: 'catchwords' };
  const cleared = { source_name: C.CASELAW_SOURCE_NAME, title: C.REDACTED_TITLE, summary: C.REDACTED_SUMMARY };
  const revised = { source_name: C.CASELAW_SOURCE_NAME, title: C.REDACTED_TITLE, summary: C.REVISED_SUMMARY };
  const notOurs = { source_name: 'HMRC guidance', title: 'A page', summary: 'words' };
  ok('a row still holding catchwords is counted', CERT.countHolding([held]) === 1);
  ok('🔴 a redacted row is NOT counted', CERT.countHolding([cleared]) === 0);
  ok('a row redacted as revised is NOT counted either', CERT.countHolding([revised]) === 0);
  ok('somebody else\'s row is never counted, and is never erased', CERT.countHolding([notOurs]) === 0);
  ok('the mixed case counts only what is held', CERT.countHolding([held, cleared, notOurs, revised]) === 1);

  // 🔴 THE RE-READ. Anchored on the erasure being followed by a fresh tally and a refusal.
  ok('🔴 the certificate is built from a tally taken AFTER the erasure',
    certCode.indexOf('const after = await withDb(tallyFrom)') > certCode.indexOf('ERASING'));
  ok('🔴 AND IT REFUSES TO PRINT IF THE RE-READ IS NOT CLEAN',
    /if \(!isClean\(after\)\)/.test(certCode) && /NO CERTIFICATE HAS BEEN PRINTED/.test(srcCertificate));
  ok('the refusal exits non-zero',
    certCode.slice(certCode.indexOf('if (!isClean(after))')).includes('process.exit(1)'));
  // The printed text must come after the refusal, not before it.
  ok('🔴 the certificate text is printed only past the refusal',
    certCode.indexOf('certificateText({ tally: after') > certCode.indexOf('if (!isClean(after))'));

  // The certificate names the licence, and carries the acknowledgement.
  const text = CERT.certificateText({ tally: { knowledge_items: 0, khoji_law: 0, khoji_runs: 3, qa_cache: 0 }, when: 'X' });
  ok('the certificate names the licence reference', text.includes('CAS-341311-V2P0M2'));
  ok('the certificate names the licensee', text.includes('Lekhio Ltd'));
  ok('🔴 the certificate carries the acknowledgement from the shared constant',
    text.includes(C.TNA_ACKNOWLEDGEMENT));
  ok('the certificate says the counts were read back after the erasure',
    /read back AFTER the erasure/.test(text));
  ok('a place still holding material is reported as REMAINING, not as erased',
    /REMAINING/.test(CERT.certificateText({ tally: { knowledge_items: 2, khoji_law: 0 }, when: 'X' })));

  // 🔴 THE LEAK DETECTOR. The one job that looks at every store at once is the right place to
  // notice that a cached customer answer mentions a tribunal decision, which would mean the filter
  // in getRelevantKnowledge had failed and a judgment had reached a user.
  ok('🔴 the certificate stops dead if a cached customer answer mentions a decision',
    /A CACHED CUSTOMER ANSWER MENTIONS A TRIBUNAL DECISION/.test(srcCertificate)
    && /process\.exit\(2\)/.test(certCode));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// H. THE TWO STATEMENTS ARE RENDERED, NOT MERELY DECLARED.
//
// Section B2 proves the constants hold the Licensor's exact words. That discharges nothing on its
// own: "must appear in a prominent location" is about a screen, and a constant nobody prints is a
// promise to nobody. This section is about the screens.
//
// 🔴 AND NEITHER PAGE MAY TYPE THE WORDS OUT. The licence holds us to a form of words. A hand
// typed second copy is the breach waiting to happen, so the pages must interpolate the constant and
// must contain no literal of either sentence.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const surfaces = { 'app/terms/page.tsx': pageTerms, 'app/team/knowledge/page.tsx': pageDesk };

  for (const [name, src] of Object.entries(surfaces)) {
    const code = codeOnly(src);
    ok(`${name} imports both statements from lib/lawsources`,
      /import \{[^}]*TNA_ACKNOWLEDGEMENT[^}]*\} from ['"][^'"]*lawsources['"]/.test(code)
      && /TNA_PARTIAL_REPRESENTATION/.test(code));
    // ⚠️ ANCHORED ON THE JSX, NOT THE IMPORT. An import is not a rendering: deleting the element
    // and leaving the import at the top is exactly the shape that kept a Run 5 guard green.
    ok(`🔴 ${name} RENDERS the acknowledgement`, /\{TNA_ACKNOWLEDGEMENT\}/.test(code));
    ok(`🔴 ${name} RENDERS the partial representation statement`, /\{TNA_PARTIAL_REPRESENTATION\}/.test(code));
    ok(`${name} does not retype the acknowledgement`,
      !src.includes('Crown copyright material reproduced'));
    ok(`${name} does not retype the partial representation statement`,
      !src.includes('only partially represent'));
  }

  // The public one has to be reachable without an account, so it must not sit under app/app.
  // ⚠️ AS FIRST WRITTEN THIS ENDED IN `|| true` AND COULD NEVER GO RED. What it is actually
  // for is that a prominent location has to be somewhere a person who is not a customer can
  // reach, so the real question is whether the page reads a session before it renders.
  ok('🔴 THE PUBLIC COPY READS NO SESSION, so a reader who is not a customer sees it',
    !/sessionUser|requireUser|requireSession|redirect\('\/in'\)/.test(codeOnly(pageTerms)));
  ok('the public copy is at /terms, which the footer links from every page',
    /alternates: \{ canonical: '\/terms' \}/.test(pageTerms));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// I. WHICH SOURCE IS UNDER WHICH LICENCE, AND WHY THE ANSWER LIVES IN CODE.
//
// We signed a licence whose stated purpose is monitoring Find Case Law, and the watcher we run
// reads GOV.UK. That is two publishers of the same kind of material under two licences, and the
// reasoning for reading GOV.UK is at the top of khoji/tribunal.mjs and still correct.
//
// 🔴 THE DANGER IN A MISMATCH IS NEVER THE DAY YOU NOTICE IT. It is the day somebody points a
// watcher at the other host because it has better coverage, ships it, and inherits four obligations
// nobody told them about, because the obligations were written in a document and not in the code.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const tsList = (srcLawSources.match(/export const SOURCE_LICENCES[\s\S]*?\];/) || [''])[0];

  ok('the registry exists in both languages',
    Array.isArray(C.SOURCE_LICENCES) && C.SOURCE_LICENCES.length >= 5 && tsList.length > 100);

  // 🔴 THE TWO LANGUAGES AGREE, HOST FOR HOST AND FLAG FOR FLAG.
  for (const entry of C.SOURCE_LICENCES) {
    ok(`the TypeScript side knows ${entry.host}`, tsList.includes(`host: '${entry.host}'`));
  }
  const tsHosts = [...tsList.matchAll(/host: '([^']+)'/g)].map((m) => m[1]);
  ok('🔴 NEITHER SIDE KNOWS A HOST THE OTHER DOES NOT',
    tsHosts.join('|') === C.SOURCE_LICENCES.map((e) => e.host).join('|'));
  const tsAck = [...tsList.matchAll(/acknowledgement: (true|false)/g)].map((m) => m[1] === 'true');
  ok('🔴 AND THEY AGREE ON WHICH HOST CARRIES THE ACKNOWLEDGEMENT',
    tsAck.join('|') === C.SOURCE_LICENCES.map((e) => e.acknowledgement).join('|'));

  ok('🔴 Find Case Law is the host that carries obligations', C.acknowledgementRequiredFor('https://caselaw.nationalarchives.gov.uk/anything') === true);
  ok('GOV.UK does not', C.acknowledgementRequiredFor('https://www.gov.uk/anything') === false);
  ok('legislation.gov.uk does not', C.acknowledgementRequiredFor('https://www.legislation.gov.uk/x') === false);
  ok('a host we never listed carries no licence at all', C.licenceFor('https://example.com/') === null);
  ok('nonsense is not silently licensed', C.acknowledgementRequiredFor('not a url') === false);

  // 🔴 THE CONDITIONAL OBLIGATION. If any host in the registry needs an acknowledgement, then
  // the statements must be RENDERED somewhere. This is the assertion that turns the mismatch from a
  // thing we remember into a thing the build enforces.
  const needs = C.SOURCE_LICENCES.filter((e) => e.acknowledgement);
  if (needs.length > 0) {
    ok('🔴 A HOST NEEDS AN ACKNOWLEDGEMENT, SO IT IS ON A SCREEN',
      /\{TNA_ACKNOWLEDGEMENT\}/.test(pageTerms) && /\{TNA_ACKNOWLEDGEMENT\}/.test(pageDesk));
    ok('🔴 AND THE TAKEDOWN AND CERTIFICATE JOBS BOTH EXIST',
      srcTakedown.length > 500 && srcCertificate.length > 500);
  }

  // ⚠️ ONE HOST LIST, NOT THREE. It was three: lawwatch kept its own, lib/lawsources kept its
  // own, and the registry is new. A host allowed by one and unknown to another is a host being read
  // under no licence at all.
  ok('🔴 khoji/lawwatch.mjs takes its allowlist from the registry rather than keeping its own',
    /import \{ ALLOWED_HOSTS as LICENSED_HOSTS \} from '\.\/caselaw\.mjs'/.test(codeOnly(srcLawWatch))
    && /export const ALLOWED_HOSTS = LICENSED_HOSTS;/.test(codeOnly(srcLawWatch)));
  ok('🔴 lib/lawsources.ts derives its allowlist from the registry rather than keeping its own',
    /export const ALLOWED_SOURCE_HOSTS: readonly string\[\] = SOURCE_LICENCES\.map/.test(codeOnly(srcLawSources)));

  // 🔴 AND NOTHING STORES TEXT FROM FIND CASE LAW TODAY. lawwatch reads that host and keeps a
  // sixteen character hash. If it ever started keeping the body, the material would be Licensed
  // Material sitting in a table the certificate counts as holding a hash.
  const lw = codeOnly(srcLawWatch);
  ok('🔴 lawwatch stores a hash of the body, never the body',
    /body_hash/.test(lw) && !/body_text|body: r\.body|indexable_content/.test(lw));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// J. THE 14 AUGUST 2026 INCIDENT. TWO LIVE DECISIONS REDACTED BY ONE PAIR OF BRACES.
//
// The takedown job's first real run removed the licensed material from BOTH rows in the record and
// reported success. The decisions were published throughout, and still are.
//
// 🔴 THE CAUSE: `Boolean(doc.withdrawn_notice)`. GOV.UK's content API returns
// `withdrawn_notice: {}`, AN EMPTY OBJECT, for content that is not withdrawn, and `Boolean({})` is
// `true` in JavaScript. Every live page on GOV.UK read as withdrawn. Not some of them. Every one.
//
// It was proved by a control, not by reading the code: /vat-rates, a page that has never been
// withdrawn, came back withdrawn=true. So the assertions below are written against the SHAPE THE
// API ACTUALLY RETURNS rather than against a shape I imagined, and the run controls that would have
// caught it on the first dry run are asserted to exist and to be reached before any row is judged.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // 🔴 THE EXACT PAYLOAD GOV.UK SENDS FOR SOMETHING THAT IS NOT WITHDRAWN.
  ok('🔴 AN EMPTY withdrawn_notice IS NOT A WITHDRAWAL', TD.isWithdrawn({ withdrawn_notice: {} }) === false);
  ok('a missing withdrawn_notice is not a withdrawal', TD.isWithdrawn({}) === false);
  ok('a null withdrawn_notice is not a withdrawal', TD.isWithdrawn({ withdrawn_notice: null }) === false);
  ok('an empty explanation is not a withdrawal',
    TD.isWithdrawn({ withdrawn_notice: { explanation: '   ' } }) === false);
  ok('an empty withdrawn_at is not a withdrawal',
    TD.isWithdrawn({ withdrawn_notice: { withdrawn_at: '' } }) === false);
  // And the real thing still is one, or the fix would have traded one failure for its opposite.
  ok('🔴 A REAL WITHDRAWAL, WITH A DATE, STILL IS ONE',
    TD.isWithdrawn({ withdrawn_notice: { withdrawn_at: '2026-08-01T00:00:00Z' } }) === true);
  ok('🔴 A REAL WITHDRAWAL, WITH AN EXPLANATION, STILL IS ONE',
    TD.isWithdrawn({ withdrawn_notice: { explanation: 'This decision has been set aside.' } }) === true);

  // 🔴 AND THE WHOLE PATH, END TO END, ON THE REAL PAYLOAD. The unit above is not enough: the
  // defect was that a true from here became a redact over there.
  ok('🔴 A LIVE PAGE WITH AN EMPTY withdrawn_notice IS NEVER REDACTED',
    TD.decide({
      status: 200,
      withdrawn: TD.isWithdrawn({ withdrawn_notice: {}, public_updated_at: '2026-08-06T11:52:57+01:00' }),
      recorded: '2026-08-06T11:52:57+01:00',
      current: '2026-08-06T11:52:57+01:00',
    }).action === 'none');
  ok('and a genuinely withdrawn one still is',
    TD.decide({
      status: 200,
      withdrawn: TD.isWithdrawn({ withdrawn_notice: { explanation: 'set aside' } }),
      recorded: '2026-08-06T11:52:57+01:00',
      current: '2026-08-06T11:52:57+01:00',
    }).action === 'redact');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// K. THE RUN CONTROLS. The check that was missing, and the reason it was missing.
//
// 🔴 THIS REPO HAS A NO-OP CONTROL IN EVERY SABOTAGE HARNESS IT OWNS, and did not have one in
// the single place that removes data from production. A verdict function that has never been shown
// a known-good answer is not a verdict function, it is a hope.
//
// Two questions asked of the live endpoint on every run, before any row is judged. If either fails
// the whole run is blind: nothing removed, nothing stamped, loud exit.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const good = { live: { published: 'published', withdrawn: false }, absent: { published: 'gone' } };
  ok('the controls pass when the endpoint behaves', TD.controlsVerdict(good).ok === true);

  ok('🔴 A LIVE PAGE READING AS GONE FAILS THE RUN',
    TD.controlsVerdict({ ...good, live: { published: 'gone', withdrawn: false } }).ok === false);
  ok('🔴 A LIVE PAGE READING AS WITHDRAWN FAILS THE RUN, which is the 14 August defect exactly',
    TD.controlsVerdict({ ...good, live: { published: 'published', withdrawn: true } }).ok === false);
  ok('🔴 AN ABSENT PATH READING AS PUBLISHED FAILS THE RUN',
    TD.controlsVerdict({ ...good, absent: { published: 'published' } }).ok === false);
  ok('a live page we could not read at all fails the run',
    TD.controlsVerdict({ ...good, live: { published: 'blind', withdrawn: false } }).ok === false);
  ok('an absent path we could not read at all fails the run',
    TD.controlsVerdict({ ...good, absent: { published: 'blind' } }).ok === false);
  ok('a failure says why, rather than just failing',
    TD.controlsVerdict({ ...good, live: { published: 'published', withdrawn: true } }).reasons.length > 0);

  // 🔴 AND THEY ARE ACTUALLY REACHED, BEFORE THE LOOP. A control computed and never consulted
  // is the same as no control.
  const td = codeOnly(srcTakedown);
  ok('🔴 the controls are consulted and stop the run',
    /if \(!controls\.ok\) \{/.test(td) && td.slice(td.indexOf('if (!controls.ok)')).includes('process.exit(1)'));
  // ⚠️ MEASURED INSIDE main() ONLY. As first written it compared indices across the whole
  // file, and restore() sits above main() with a `for (const row of rows)` of its own, so it was
  // comparing the controls against the WRONG LOOP and went red for the wrong reason.
  const mainOnly = td.slice(td.indexOf('async function main()'));
  ok('the slice really is main and not the whole file',
    mainOnly.length > 200 && mainOnly.length < td.length);
  ok('🔴 AND THEY RUN BEFORE ANY ROW IS JUDGED',
    mainOnly.indexOf('if (!controls.ok)') > -1
    && mainOnly.indexOf('for (const row of rows)') > -1
    && mainOnly.indexOf('if (!controls.ok)') < mainOnly.indexOf('for (const row of rows)'));
  ok('the two control paths are named constants, not buried literals',
    typeof TD.CONTROL_LIVE === 'string' && typeof TD.CONTROL_ABSENT === 'string'
    && TD.CONTROL_LIVE !== TD.CONTROL_ABSENT);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// L. LIKE COMPARED WITH LIKE, AND A REMOVAL THAT CAN BE UNDONE.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const td = codeOnly(srcTakedown);

  // ⚠️ THE STAMP COMES FROM THE ENDPOINT THIS JOB READS, NOT FROM THE ONE THE WRITER READS.
  // It used to fall back to the search endpoint's public_timestamp, a different field from a
  // different endpoint. They agreed on the rows in the record, which is exactly why it looked fine.
  ok('🔴 the revision comparison uses only a stamp this job took',
    TD.recordedStamp({ content_api_updated_at: '2026-01-01' }) === '2026-01-01');
  ok('🔴 AND IGNORES THE WRITER\'S FIELD, so two endpoints are never compared',
    TD.recordedStamp({ source_updated_at: '2026-01-01', published: '2026-01-01' }) === null);
  ok('a row this job has never stamped baselines rather than being called revised',
    TD.decide({ status: 200, recorded: TD.recordedStamp({ published: '2026-01-01' }), current: '2026-06-01' }).action === 'stamp');
  ok('the stamp it writes is the one it reads back',
    /content_api_updated_at/.test(td) && td.split('content_api_updated_at').length >= 3);

  // 🔴 A DESTRUCTIVE STEP THAT KEEPS NO NOTE OF WHAT IT DESTROYED CANNOT BE WALKED BACK.
  // When the withdrawn_notice defect redacted two live decisions, nothing in either row recorded
  // that they had been 'reviewed'.
  // ⚠️ ANCHORED INSIDE THE REDACTION'S OWN QUERY. As first written it tested the file for
  // the string anywhere, and restore() mentions the same field twice, so a sabotage that took it
  // out of the UPDATE that actually writes it STAYED GREEN. The name being present somewhere is
  // not the same as the destructive step recording it.
  const redactQuery = td.slice(td.indexOf("if (verdict.action === 'redact')"),
    td.indexOf("} else if (verdict.action === 'stamp')"));
  ok('the slice really is the redaction', redactQuery.includes('update public.knowledge_items'));
  ok('🔴 THE REDACTION ITSELF RECORDS THE STATUS IT OVERWROTE',
    /'status_before_removal', \$\d::text/.test(redactQuery));
  ok('and it passes the row\'s real status, not a constant',
    /row\.status \|\| 'needs_distillation'/.test(redactQuery));
  ok('the restore reads that status back rather than guessing one',
    /status_before_removal/.test(td) && /restore/.test(td));

  // 🔴 RESTORE EXISTS, AND IT REFUSES TO PUT BACK SOMETHING GENUINELY TAKEN DOWN.
  ok('🔴 there is a way to put back what a wrong removal took', /RESTORE = process\.argv\.includes\('--restore'\)/.test(td));
  ok('🔴 AND IT LEAVES A GENUINELY GONE DECISION REDACTED, which is the actual obligation',
    /if \(published === 'gone'\) \{ left \+= 1;/.test(td));
  ok('it will not restore over a source it could not read',
    /if \(published === 'blind'\) \{ blind \+= 1;/.test(td));
  // 🔴 AND THE CONTROLS GUARD THE RESTORE TOO. The takedown pass fails towards removing
  // something it should have kept, which is recoverable. This one fails towards putting back
  // material we are obliged not to hold, which is the breach itself.
  const restoreOnly = td.slice(td.indexOf('async function restore()'), td.indexOf('async function main()'));
  ok('the slice really is restore', restoreOnly.length > 200);
  ok('🔴 THE RESTORE RUNS THE CONTROLS BEFORE IT PUTS ANYTHING BACK',
    /if \(!guard\.ok\)/.test(restoreOnly)
    && restoreOnly.indexOf('if (!guard.ok)') < restoreOnly.indexOf('for (const row of rows)'));
  ok('and a failed control stops it', restoreOnly.slice(restoreOnly.indexOf('if (!guard.ok)')).includes('process.exit(1)'));

  // 🔴 AND IT REBUILDS THROUGH THE SAME STRIPPER THE WRITER USES. A restore that hand rebuilt
  // the row would be the one place in the product where the parties quietly came back.
  const rebuilt = TD.rebuild(
    { title: 'DAVID HILL and DAVID MCCRACKEN v THE COMMISSIONERS FOR HMRC [2026] UKUT 00306 (TCC)', indexable_content: 'PENALTIES. Smith v HMRC considered.' },
    ['penalties / discovery'],
  );
  ok('🔴 A RESTORED TITLE NAMES NO PARTIES', C.namesParties(rebuilt.title) === false);
  ok('🔴 RESTORED CATCHWORDS NAME NO PARTIES', C.namesParties(rebuilt.catchwords) === false);
  ok('a restored title keeps the citation, so the desk can still find the decision',
    rebuilt.title.includes('[2026] UKUT 00306 (TCC)'));
  ok('a restored title still leads with the rule at risk, which is our text and not the judge\'s',
    rebuilt.title.includes('penalties / discovery'));
  ok('the restore calls the shared stripper rather than its own',
    /title: `⚖️ MAY AFFECT: \$\{rules\}\. \$\{stripParties\(hit\.title\)\}`/.test(td)
    && /catchwords: stripParties\(/.test(td));
  ok('a restored summary says it was restored, so the desk is not misled about its history',
    TD.restoredSummary(['x'], 'y').includes('Restored after an incorrect removal'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// M. A CHECK THAT COULD NOT RUN IS NOT A CHECK THAT PASSED.
//
// The leak detector hard coded a column called `answer`, that column does not exist in this
// deployment, the query threw, and the whole thing reported a quiet minus one that nothing acted
// on. Same failure shape as the empty withdrawn_notice: a value that is not an answer, treated as
// one.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const cert = codeOnly(srcCertificate);
  ok('🔴 the leak detector discovers its columns rather than guessing one',
    /information_schema\.columns/.test(cert) && /table_name = 'qa_cache'/.test(cert));
  ok('🔴 AND A COUNT IT COULD NOT TAKE STOPS THE JOB rather than reading as zero',
    /if \(before\.qa_cache === null\)/.test(cert)
    && /THE LEAK DETECTOR COULD NOT RUN/.test(srcCertificate));
  // ⚠️ ANCHORED IN THE BRANCH THAT SETS IT. Testing the file for the name went green over a
  // sabotage that removed it from the one branch where it is the only explanation available.
  const noCols = cert.slice(cert.indexOf('if (textCols.length === 0)'), cert.indexOf('} else {'));
  ok('the slice really is the no columns branch', noCols.includes('tally.qa_cache = null'));
  ok('🔴 THE BRANCH THAT CANNOT COUNT SAYS WHY',
    /tally\._qa_cache_note = '/.test(noCols));
  ok('and the branch that can count says what it searched',
    /tally\._qa_cache_note = `searched/.test(cert));
  ok('the reason is printed rather than swallowed', /_qa_cache_note/.test(cert));
  ok('a null count never reads as erased', CERT.isClean({ knowledge_items: null, khoji_law: 0 }) === false);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
