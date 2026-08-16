// Whose voice is the citation in? See lib/rulesources.ts, the RuleSource.authority note.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN THE WORDS THAT WERE ACTUALLY ON THE SITE.
//
// RUN 0 of the customer week walked /can-i-claim as a stranger on 11 August 2026 and read this,
// live, under the Pension contributions card:
//
//   "S188 Finance Act 2004 (relief at source). [warning sign] This sources the RELIEF ONLY. We
//    also tell him a personal pension is NOT a business expense, and HMRC nowhere says so in
//    words we can quote: it is an argument from omission (pensions appear nowhere in the
//    allowable expenses guide). That half of the rule remains OURS."
//
// Nothing in it is untrue. All of it was written for us. A customer reads "we", "him" and "OURS"
// and learns that the people telling him what to sign his name to are mid argument about whether
// they can back it up. Haircuts, Bank charges, Materials, Bad debts and Training carried the same
// residue, and several cards had the GOV.UK bullet list pasted in underneath.
//
// It was never one page. The same field renders on /app/tax/can-i-claim to signed in customers,
// publishes at /rules.json, and feeds lib/synthesis.ts, which captions the first clause with
// "This is the law itself. Parliament wrote it."
//
// THE RULE. A CITATION IS A REFERENCE, NOT PROSE.
//
// One sentence. The statute, the case, or the GOV.UK page, and nothing after it. Not because
// working notes are bad, but because they belong in a comment, where nobody is asked to read them
// while deciding what to put on a tax return.
//
// This suite is a SHAPE test, not a list of banned phrases. A banned phrase list only ever catches
// the paste you already found.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RULE_SOURCES } from '../lib/rulesources.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, '..', rel), 'utf8');

// The acronyms a real citation is made of. Anything else shouted in capitals is somebody making a
// point, and a citation does not make points.
//
// AMENDED IN RUN 6, 16 August 2026, AND HERE IS WHY IT WAS STALE RATHER THAN ME BEING WRONG.
//
// The rule this list protects: a citation is made of the short forms a reference is actually
// written in. Anything else in capitals is somebody raising their voice at the customer, and a
// citation does not raise its voice. That rule is unchanged.
//
// The list already carried THREE HMRC internal manual prefixes. BIM is the Business Income
// Manual, EIM the Employment Income Manual, CG the Capital Gains Manual. Two of those three,
// EIM and CG, are cited by NOTHING in lib/rulesources.ts and never have been. So the list was
// written as the CLASS of thing a citation is made of, not as an inventory of what happened to
// be in the file that day. PTM is the Pensions Tax Manual, the same class exactly, and it was
// missing only because no card had needed to point at it yet.
//
// If a later run adds a manual prefix that is NOT a real HMRC manual, that is the thing this
// guard should still catch, so the test is: does GOV.UK publish a manual under that prefix.
// PTM043100 is live at gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm043100.
const ACRONYMS = new Set([
  'GOV', 'UK', 'HMRC', 'ITTOIA', 'ITEPA', 'ITA', 'TCGA', 'TMA', 'CTA', 'CAA', 'VATA', 'FA',
  'HL', 'TC', 'STC', 'EWCA', 'EWHC', 'UKSC', 'UKUT', 'UKFTT', 'BIM', 'EIM', 'CG', 'SI', 'PTM',
  'VAT', 'CIS', 'MTD', 'PAYE', 'NI', 'CWF',
]);

// Every way a note to ourselves gives itself away.
function voiceFaults(text) {
  const faults = [];

  // A second sentence is commentary. ". " followed by more words, allowing "GOV.UK" and initials.
  if (/\.\s+\S/.test(text)) faults.push('more than one sentence');

  // ⚠️ "we", "us", "him", NOT "you". A GOV.UK page title is allowed to address its reader:
  // "Expenses if you are self-employed" and "Tax on your private pension contributions" are
  // HMRC's own titles and quoting them is the entire point. What gives an internal note away is
  // the OTHER voice, the one that talks about the customer in the third person and about us in
  // the first: "we also tell him", "that half of the rule remains ours".
  if (/\b(we|our|ours|us|him|his|he)\b/i.test(text)) faults.push('first or third person');

  // Shouting.
  for (const token of text.split(/[^A-Za-z]+/)) {
    if (token.length >= 3 && token === token.toUpperCase() && !ACRONYMS.has(token)) {
      faults.push(`shouted word "${token}"`);
    }
  }

  // A pasted list, in any of its usual dresses.
  if (/\bthe list under it is\b/i.test(text)) faults.push('a pasted GOV.UK list');
  if (/\b(allowable|not allowable)\s*:/i.test(text)) faults.push('a pasted GOV.UK list');
  if ((text.match(/;/g) || []).length > 2) faults.push('a pasted GOV.UK list');

  // Editorial furniture.
  if (/[⚠🔴✅❌]/u.test(text)) faults.push('a warning sign');
  if (/["“”]/.test(text)) faults.push('a quoted fragment');
  if (/\bkhoji\b/i.test(text)) faults.push('an internal system name');

  // A citation is short. The longest real one we hold is 66 characters.
  if (text.length > 120) faults.push(`too long at ${text.length} characters`);

  return faults;
}

const all = Object.entries(RULE_SOURCES).flatMap(([key, sources]) =>
  sources.map((s, i) => ({ key, i, s })),
);

console.log(`\n--- Every citation we publish. ${all.length} sources across ${Object.keys(RULE_SOURCES).length} rules ---\n`);
ok('there are sources to check', all.length > 0);

// Self test: the guard has to be able to fail, or it is decoration. The sentence that started all
// of this is run through it here, so a green suite is never green because the check went blind.
const THE_SENTENCE = 'S188 Finance Act 2004 (relief at source). ⚠️ This sources the RELIEF ONLY. '
  + 'We also tell him a personal pension is NOT a business expense. That half of the rule remains OURS.';
ok('🔴 THE GUARD CATCHES THE EXACT SENTENCE RUN 0 FOUND', voiceFaults(THE_SENTENCE).length > 0);
ok('and it catches a pasted GOV.UK list',
  voiceFaults('GOV.UK, Expenses if you are self-employed. The list under it is: stationery; rent, rates, power and insurance costs.').length > 0);
ok('and it lets a real citation through',
  voiceFaults('S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)').length === 0);
ok('and it lets a GOV.UK page reference through',
  voiceFaults('GOV.UK, Expenses if you are self-employed: Training courses').length === 0);
ok('and it lets a real HMRC manual code through', voiceFaults('PTM043100').length === 0);
ok('🔴 while STILL catching a capitalised word that is not a manual code',
  voiceFaults('PENSIONS043100').length > 0);

let dirty = 0;
for (const { key, i, s } of all) {
  if (s.authority) {
    const faults = voiceFaults(s.authority);
    if (faults.length) dirty++;
    ok(`${key}[${i}] authority is a reference${faults.length ? `, but reads as ${faults.join(', ')}: "${s.authority.slice(0, 90)}"` : ''}`,
      faults.length === 0);
  }
  // The code renders on the same line, so it lives by the same rule.
  const codeFaults = voiceFaults(s.code);
  ok(`${key}[${i}] code is a reference${codeFaults.length ? `, but reads as ${codeFaults.join(', ')}` : ''}`,
    codeFaults.length === 0);
}
ok(`🔴 NOT ONE PUBLISHED CITATION IS IN THE INTERNAL VOICE${dirty ? ` (${dirty} still are)` : ''}`, dirty === 0);

console.log('\n--- The named regressions from RUN 0 ---\n');
{
  const authorityOf = (k) => RULE_SOURCES[k]?.[0]?.authority ?? '';
  const named = Object.keys(RULE_SOURCES);
  const find = (re) => named.filter((k) => re.test(k));

  const pension = find(/pension/i)[0];
  ok('the pension rule is still cited', Boolean(pension));
  ok('🔴 AND THE PENSION CARD NO LONGER ARGUES WITH ITSELF IN FRONT OF THE CUSTOMER',
    !/OURS|argument from omission|We also tell/i.test(authorityOf(pension)));
  ok('while keeping the statute, which was the good half',
    authorityOf(pension).includes('S188 Finance Act 2004'));

  // The rest of the named cards, by the shape of what was wrong on each.
  const banned = [
    ['the internal first person', /\bWe also tell\b|\bremains OURS\b/i],
    ['the warning sign', /⚠/u],
    ['the haircuts aside', /HMRC nowhere names haircuts/i],
    ['the bank charges commentary', /NO CAP is stated/i],
    ['the pasted lists', /The list under it is/i],
    ['the shouted training note', /HMRC BROADENED/],
    ['the bad debt quote fragment', /should not be admitted as a deduction/i],
  ];
  for (const [what, re] of banned) {
    const hits = all.filter(({ s }) => re.test(s.authority ?? '')).map(({ key }) => key);
    ok(`${what} is gone from every card${hits.length ? ` (still on ${hits.join(', ')})` : ''}`, hits.length === 0);
  }
}

console.log('\n--- The statute survived the clean, which was the point of keeping it ---\n');
{
  const withStatute = all.filter(({ s }) => /ITTOIA|Finance Act|CTA|Income Tax \(Trading/.test(s.authority ?? ''));
  ok(`🔴 the statute references are still there (${withStatute.length} of them)`, withStatute.length >= 10);
  const mallalieu = all.filter(({ s }) => /Mallalieu v Drummond \[1983\] 57 TC 330 \(HL\)/.test(s.authority ?? ''));
  ok(`🔴 and so is the House of Lords, on all ${mallalieu.length} cards that rest on it`, mallalieu.length >= 4);
  ok('every source still names a GOV.UK page', all.every(({ s }) => /^https:\/\/(www\.)?gov\.uk\//.test(s.url)));
  ok('and every source still carries its verbatim quote for Khoji to check nightly',
    all.every(({ s }) => typeof s.quote === 'string' && s.quote.length > 10));
}

console.log('\n--- The render path. Only the reference reaches the card ---\n');
{
  // 🔴 THE QUOTE IS THE OTHER PLACE THE LISTS LIVE. It is a verbatim slab of GOV.UK, kept that way
  // on purpose so khoji/corpus.mjs can check it word for word every night, and it must never be
  // what the customer is shown. Rendering it would put every bullet list back on the page by a
  // different door.
  for (const file of ['app/can-i-claim/page.tsx', 'app/app/tax/can-i-claim/page.tsx']) {
    const src = read(file);
    const cite = /function (Citation|Source)\(\{ ruleKey[\s\S]*?\n}/.exec(src)?.[0] ?? '';
    ok(`${file}: the citation component was read`, cite.length > 0);
    ok(`${file}: it renders the code`, cite.includes('s.code'));
    ok(`${file}: it renders the authority`, cite.includes('s.authority'));
    ok(`🔴 ${file}: IT NEVER RENDERS THE VERBATIM QUOTE`, !cite.includes('s.quote'));
    ok(`${file}: and it still links to the GOV.UK page, which is the trust`, cite.includes('s.url'));
  }
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
