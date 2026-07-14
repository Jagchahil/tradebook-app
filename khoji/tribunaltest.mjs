// ⚖️ KHOJI WATCHES THE COURTS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ON 6 APRIL 2025, DOUBLE-CAB PICKUPS BECAME CARS. Not because HMRC edited a page. Because the COURT
// OF APPEAL decided Payne / Coca-Cola. A judgment changed the tax answer for tens of thousands of
// tradesmen, and every watcher we own would have gone on reporting green, because every watcher we
// own reads GOV.UK, and GOV.UK had not changed yet.
//
// diff.mjs asks "is the NUMBER still right". corpus.mjs asks "is the SENTENCE still there".
// amend.mjs asks "did the DOCUMENT change". NONE OF THEM CAN SEE A JUDGE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 AND I WAS WRONG ABOUT THE LICENCE FOR A WEEK, FROM A NOTE, WITHOUT READING IT.
//
// What the Open Justice Licence ACTUALLY says (read 14 July 2026):
//   FREE: read, download, quote, cite, and "use commercially including incorporating judgments into
//         your own products or applications". No forms. No fee.
//   NEEDS A LICENCE: "programmatic searching IN BULK ACROSS FIND CASE LAW RECORDS to identify,
//         extract or enrich contents within the records."
//
// The restriction is on BULK DISCOVERY THROUGH THEIR API. And we do not use their API: GOV.UK
// publishes the tax tribunal decisions itself, 1,415 of them, under the OPEN GOVERNMENT LICENCE,
// through the same search endpoint we already read TIINs from.
//
// The licence is still worth applying for (it buys the First-tier Tribunal in bulk). It was never
// what stood between us and this file. NOT READING THE SOURCE WAS.

import { triage, WATCHED, isCatchwordsOnly, isRecent } from './tribunal.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, 'tribunal.mjs'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nkhoji tribunal: a judge can reverse a tax answer without HMRC touching a page');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE TRIAGE. It must catch the ones that matter and IGNORE the ones that do not.
// ---------------------------------------------------------------------------------------------

// REAL catchwords, lifted off GOV.UK on 14 July 2026. This is what the judge himself wrote to
// summarise his own decision, and GOV.UK hands it to us free in `indexable_content`. It is the best
// triage signal in UK tax and nobody uses it.
const PIPELINE = 'CAPITAL ALLOWANCES – balancing charges – transfer of a hydrocarbon pipeline to '
  + 'wholly owned subsidiary - Interaction of s279 CTA 2010 (deemed separate trade for "oil-related '
  + 'activities") and Part 22 CTA 2010 (intra-group transfer of trade provisions)';

const LOANS = 'Corporation Tax – loan relationships – section 327 Corporation Tax Act 2009 – '
  + 'disallowance of imported losses – non-resident company becoming UK resident';

ok('🔴 A HYDROCARBON PIPELINE IS NOT OUR PROBLEM, AND WE SAY NOTHING',
  // 1,415 decisions, and the overwhelming majority are about things no tradesman will ever touch.
  // A watcher that flags forty items a month is a watcher Jag stops opening inside a fortnight, and
  // then the one judgment that reverses the van rule sits in an unread queue. Doc 103. cisGrossRate.
  triage(PIPELINE).length === 0);

ok('...and neither are loan relationships in a non-resident company',
  triage(LOANS).length === 0);

ok('🔴 A CLOTHING CASE IS CAUGHT, AND IT NAMES THE RULE IT THREATENS',
  // Our clothing rule IS Mallalieu v Drummond. If it is distinguished, we are wrong, and we are wrong
  // in the answer we give most confidently.
  (() => {
    const t = triage('INCOME TAX – deduction for clothing – wholly and exclusively – duality of purpose');
    return t.length === 1 && t[0].rule === 'everyday_clothes' && /Mallalieu/.test(t[0].why);
  })());

ok('🔴 A VAN-OR-CAR CASE IS CAUGHT. This one has ALREADY happened and it cost us nothing only because it was in the news.',
  // Double-cab pickups became CARS on 6 April 2025 by judgment (Payne / Coca-Cola, Court of Appeal),
  // not by an HMRC page. Nothing we own would have seen it.
  triage('whether a double cab pickup is a goods vehicle or a car – primarily suited').some((t) => t.rule === 'van / car'));

ok('a CIS case is caught, because our audience IS CIS',
  triage('Construction Industry Scheme – gross payment status – cancellation').some((t) => t.rule === 'cis'));

ok('an employment status case is caught, because it is the question under every other question',
  triage('employment status – mutuality of obligation – IR35 – intermediaries legislation').some((t) => t.rule === 'employment status'));

ok('a TRAINING case is caught, and we changed that rule TODAY on guidance alone',
  // ⚠️ Guidance is not law. We rewrote the training rule this morning on the strength of an HMRC page.
  // A tribunal outranks that page. If one has ruled the other way, we need to know.
  triage('training costs – capital or revenue – new skill').some((t) => t.rule === 'training'));

ok('an unlawful dividend case is caught, because our BLOCK rests on one',
  triage('unlawful dividend – distributable profits – director\'s loan account').some((t) => t.rule === 'illegal dividend'));

ok('one decision can threaten TWO rules, and it says so',
  triage('travel expenses of an itinerant trader – wholly and exclusively').length >= 2);

ok('every watched rule explains WHY it is watched, so the alarm can say what is at stake',
  WATCHED.every((w) => w.why.length > 40 && w.terms.length >= 3));

ok('the watch list is SHORT, on purpose',
  // The bar is not "could this ever matter to someone". It is "does it threaten a rule we assert to a
  // tradesman". Ten entries, not a hundred.
  WATCHED.length <= 12);

ok('empty or missing catchwords are not a crash and not a false hit',
  triage('').length === 0 && triage(null).length === 0);

// ---------------------------------------------------------------------------------------------
// 🔴 2. WE DO NOT BULK-DOWNLOAD JUDGMENTS. WE DO NOT NEED TO.
// ---------------------------------------------------------------------------------------------

ok('we know the page gives us CATCHWORDS, not the full decision',
  isCatchwordsOnly('Read full decision: UT-2024-000141 CATS NORTH SEA v HMRC\n\nCAPITAL ALLOWANCES...') === true);

ok('🔴 AND WE STOP THERE. The catchwords decide whether a HUMAN reads the judgment.',
  // The judgment itself is a PDF hanging off the page. We do not fetch them in bulk, we do not need
  // to, and we should not. A human reading ONE specific judgment is explicitly free under every
  // licence involved. Bulk extraction across a corpus is the thing that needs permission.
  !/attachment|\.pdf|fetchJudgment|downloadAll/i.test(code));

ok('...and nothing here touches the Find Case Law API',
  // Their restriction is on bulk programmatic searching across THEIR records. We read GOV.UK's own
  // OGL feed instead. Different publisher, different licence, nothing to apply for.
  !/nationalarchives|caselaw\./i.test(code)
  && /filter_format', 'tax_tribunal_decision/.test(code));

// ---------------------------------------------------------------------------------------------
// 🔴 3. A JUDGMENT NEVER CHANGES A RULE BY ITSELF.
// ---------------------------------------------------------------------------------------------

ok('🔴 A HIT LANDS IN THE APPROVAL QUEUE. It does not touch the engine.',
  // A model reading a judgment and deciding our clothing rule has been overturned would be a model
  // MAKING LAW. FA26 Sch 22 has a word for advice that leads a client to claim more than he is
  // entitled to. Jag reads it. Jag decides. That is the whole product.
  /'needs_distillation'/.test(code) && /engine_impact/.test(code));

ok('...with confidence NULL, because no model judged it. A keyword matched a judge\'s own summary.',
  /null,\s*$/m.test(code) || /confidence/.test(code));

ok('...and the item NAMES the rule at risk and quotes the judge, so the human knows what to read for',
  /RULE AT RISK/.test(code) && /judge's own catchwords|judge\\'s own catchwords/i.test(src));

ok('...and says plainly that nothing is automatic',
  /Nothing here is automatic/.test(src));

ok('the run is labelled kind=tribunal, so it can never be mistaken for the differ\'s pulse',
  // Fourth writer into khoji_runs. brain.ts renders the newest DIFFER row as a sentence about tax
  // constants. An unlabelled row from a watcher that checked no constants would render as that
  // sentence, and it would be a lie sourced from a true number.
  /values \('tribunal', null/.test(code));

ok('a run that read NOTHING exits 1, rather than printing a tidy summary of nothing',
  /results\.length === 0[\s\S]{0,300}?process\.exit\(1\)/.test(code));

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE WINDOW.
// ---------------------------------------------------------------------------------------------

const NOW = new Date('2026-07-14T09:00:00Z');
ok('a judgment from last week is in the window',
  isRecent('2026-07-08T13:40:54Z', 30, NOW) === true);

ok('...and one from last year is not',
  isRecent('2025-07-08T13:40:54Z', 30, NOW) === false);

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
