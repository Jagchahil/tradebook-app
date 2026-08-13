// The seams. Three places where one fact was written down twice and the copies drifted apart.
//
//   node test/seams.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN THREE STORIES, ALL FOUND ON 11 AUGUST 2026, THE DAY
// AFTER LAUNCH, BY WALKING THE PRODUCT AS THE MAN IT WAS BUILT FOR.
//
// 1. THE WEDGE WAS NOT IN ITS OWN SIGNUP. CLAUDE.md names this product's audience by trade, in
//    one sentence: electricians, plumbers, builders, plasterers, roofers, joiners, decorators,
//    tilers, gas engineers, scaffolders, groundworkers, landscapers. Four of those twelve had no
//    chip on step 3 of /start. A groundworker reached the third question of his own signup, read
//    twenty trades, and had to answer "Something else", while Cafe, Tutor and Photographer each
//    had a chip. lib/trades.ts has held all four correctly the whole time, with a landing page
//    each, so we were buying his attention with a page written for him and then telling him at the
//    door that we do not know what he is.
//
// 2. A MAN WITH NO PROPERTY WAS TOLD WHAT WE ARE NOT COUNTING OF HIS RENT. TURNOVER_BASIS_NOTE
//    carried "and not your rent, which is exempt" inside it, and /app/tax/vat printed it on all
//    three threshold arms to everybody. Most customers here are sole traders with a van and no
//    property at all. It is the same defect /app/you/vat carried until 9 August, where Reg 111 was
//    promised to a man who had never registered.
//
// 3. A £280 SDS DRILL FROM SCREWFIX WAS FILED AS MATERIALS AND COULD NEVER BE ANYTHING ELSE. The
//    materials rule opens with the five shops a UK tradesman actually buys his TOOLS from, first
//    match wins, and the whole tools ruleset sat underneath it. Downstream, lib/taxoptimiser.ts
//    tells a man with a van full of tools "You have nothing logged this year for phone, tools".
//
// THE SHAPE ALL THREE SHARE: one fact, held in two places, where only one of them was maintained.
// A picker typed out beside a corpus that already knew. A clause welded into a sentence that is
// said to people it is not true of. A category decided by the name of a shop that sells both.
//
// ⚠️ SO THE FIRST GUARD BELOW READS THE DOCTRINE ITSELF. It lifts the trade nouns out of
// CLAUDE.md at run time and proves every one of them is reachable from the signup picker. A guard
// that names the trades in its own words is a fifth copy of the list, and it would go stale on the
// day somebody adds a thirteenth trade to the doctrine, which is the exact day it needs to fire.
//
// ⚠️ AND THE RENT GUARD RUNS THE CONDITION RATHER THAN READING THE STRING. "The page mentions
// rent" and "the page tells THIS MAN about rent" are different claims, and only the second one is
// the defect. The branch is lifted out of the page and evaluated both ways.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RENT_NOT_COUNTED_NOTE, TURNOVER_BASIS_NOTE } from '../lib/vat.ts';
import {
  RULE_COUNT, TOOL_AND_MATERIAL_MERCHANTS, categoriseBankLine, couldBeToolSpend,
} from '../lib/categories.ts';

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
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf(a) < indexOf(b) is true when a is missing
// entirely, because indexOf returns -1. Two security guards shipped vacuous on exactly that on 10
// August. This helper is the lesson, and every ordering claim below goes through it.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

// Comments are where the arguments live, and an argument is not a behaviour. Every claim about
// what the code DOES is made against the source with the comments taken out, so a sentence quoted
// in a note explaining a bug can never be mistaken for the bug still being there.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const startPage = codeOnly(read('app/start/page.tsx'));
const taxVat = codeOnly(read('app/app/tax/vat/page.tsx'));
const cats = read('lib/categories.ts');

console.log('\n--- 1. THE DOCTRINE NAMES TWELVE TRADES. ALL TWELVE MUST BE REACHABLE ---\n');
{
  // 🔴 DERIVED, NOT TYPED. Read out of CLAUDE.md at run time, so this cannot rot: the day a
  // thirteenth trade is named in the doctrine is the day this suite starts asking for it.
  const doctrine = read('CLAUDE.md');
  const sentence = /Targets all UK self-employed trades:([^.]*)\./.exec(doctrine)?.[1] ?? '';
  ok('the doctrine sentence is where this suite thinks it is, so nothing below passes vacuously',
    sentence.trim().length > 40);

  const named = sentence.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    .map((s) => s.replace(/s$/, ''));
  ok('and it names twelve trades, so a doctrine that shrank is not read as a picker that grew',
    named.length === 12);
  ok('including the four that were missing on launch day',
    ['tiler', 'gas engineer', 'scaffolder', 'groundworker'].every((t) => named.includes(t)));

  const arr = /const trades = \[([\s\S]*?)\];/.exec(startPage)?.[1] ?? '';
  ok('the signup picker list is where this suite thinks it is', arr.trim().length > 100);
  const chips = [...arr.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  ok('and it has a real list of chips in it', chips.length >= 12);

  const chipSet = new Set(chips.map((c) => c.toLowerCase()));
  for (const trade of named) {
    ok(`🔴 "${trade}" is reachable from the signup picker without typing`, chipSet.has(trade));
  }

  // ⚠️ ORDER IS THE OTHER HALF OF IT. Reachable at the bottom of twenty four chips on a phone is
  // reachable the way a helpline is open: technically.
  const idx = (name) => chips.findIndex((c) => c.toLowerCase() === name);
  const lastWedge = Math.max(...named.map(idx));
  const firstOther = chips.findIndex((c) => !named.includes(c.toLowerCase()));
  ok('🔴 THE WEDGE COMES FIRST, so a groundworker is not scrolling past a photographer to find himself',
    lastWedge >= 0 && firstOther > lastWedge);
  ok('and that holds in the source too, not only in the array this suite parsed out of it',
    before(startPage, "'Groundworker'", "'Photographer'") && before(startPage, "'Tiler'", "'Cafe'"));

  // The chip is an ANSWER, not a label: it is posted as his trade and read by findSic. So the
  // strings the picker offers have to be strings the SIC recommender can do something with, or a
  // limited company tiler gets a blank box where his code should be.
  ok('the chip travels with the signup as his trade, and only what he actually saw is sent',
    /trade: trade === 'Something else' \? customTrade\.trim\(\) : trade,/.test(startPage));

  // ⚠️ THE DECISION NOT TO DERIVE FROM lib/trades.ts, PINNED. TRADES is 39 objects carrying a
  // blurb and six claims of marketing prose each for the /for/<slug> pages. This is a client
  // component, so mapping over it here ships every byte of that to a phone on a bad signal to draw
  // a row of chips. The guard above is what keeps the list honest; this one keeps the fix cheap.
  ok('the signup picker does not pull the marketing corpus into the client bundle',
    !/from '.*\/trades'/.test(startPage) && !/from '\.\.\/\.\.\/lib\/trades'/.test(startPage));
}

console.log('\n--- 2. AND NOBODY ELSE IS TURNED AWAY AT THE DOOR ---\n');
{
  const arr = /const trades = \[([\s\S]*?)\];/.exec(startPage)?.[1] ?? '';
  const chips = [...arr.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const doctrine = read('CLAUDE.md');
  const named = (/Targets all UK self-employed trades:([^.]*)\./.exec(doctrine)?.[1] ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).map((s) => s.replace(/s$/, ''));

  const other = chips.filter((c) => !named.includes(c.toLowerCase()) && c !== 'Something else');
  ok('🔴 THE PICKER STILL OFFERS A ROUTE THAT IS NOT CONSTRUCTION, so a hairdresser is not turned away',
    other.length >= 5 && chips.some((c) => c.toLowerCase() === 'hairdresser'));
  ok('and the landlord chip is still there, which is the same fix from 31 July',
    chips.includes('Landlord'));

  ok('the last chip is the free text way in for everybody we did not name',
    chips[chips.length - 1] === 'Something else');
  ok('...and picking it opens a box he types into', /setCustomTrade\(e\.target\.value\)/.test(startPage));
  ok('...and Continue waits for him to fill it, so nobody arrives with an empty trade',
    /trade !== 'Something else' \|\| customTrade\.trim\(\)\.length > 1/.test(startPage));
}

console.log('\n--- 3. THE RENT CLAUSE IS SAID TO A MAN WHO HAS RENT, AND TO NOBODY ELSE ---\n');
{
  ok('the VAT screen asks whether he has a property stream at all, from his own statements only',
    /accountHasRental\(user\.id\)/.test(taxVat));
  // Read only on the arm that says it, exactly as the turnover figure is. The registered screen
  // never prints the basis sentence, so it must never pay for the read either.
  ok('and it is asked only on the arm that prints the sentence',
    /const hasRental = profile !== null && !profile\.registered\s*\?\s*await accountHasRental\(user\.id\)\s*:\s*false;/
      .test(taxVat));

  // 🔴 THE CONDITION, RUN. Not "the page mentions rent" but "the page tells THIS MAN about rent",
  // which is the only version of this claim that is the defect.
  const expr = /const rentClause = ([^;]+);/.exec(taxVat)?.[1] ?? '';
  ok('the branch is one expression and this suite found it', expr.includes('hasRental'));
  const clauseFor = (hasRental) =>
    Function('hasRental', 'RENT_NOT_COUNTED_NOTE', `return ${expr};`)(hasRental, RENT_NOT_COUNTED_NOTE);

  ok('🔴 A CUSTOMER WITH NO PROPERTY IS TOLD NOTHING AT ALL ABOUT RENT', clauseFor(false) === '');
  ok('🔴 AND A CUSTOMER WHO HAS PROPERTY IS STILL TOLD',
    clauseFor(true).includes(RENT_NOT_COUNTED_NOTE));
  ok('so it is a branch rather than a constant, which is the whole fix',
    clauseFor(true) !== clauseFor(false));

  // The sentence each of them actually reads, composed the way the page composes it.
  const saidTo = (hasRental) => TURNOVER_BASIS_NOTE + clauseFor(hasRental);
  ok('🔴 THE SENTENCE A SOLE TRADER READS DOES NOT MENTION RENT', !/\brent\b/i.test(saidTo(false)));
  ok('🔴 AND THE ONE A LANDLORD READS SAYS HIS RENT IS NOT IN THE FIGURE',
    /\brent\b/i.test(saidTo(true)) && /exempt/.test(saidTo(true)));
  ok('and the basis is identical for both, because no figure moved',
    saidTo(false).startsWith(TURNOVER_BASIS_NOTE) && saidTo(true).startsWith(TURNOVER_BASIS_NOTE));

  // ⚠️ ALL THREE ARMS, INCLUDING THE HAND WRITTEN ONE. Two of them share TURNOVER_BASIS_NOTE and
  // the young account arm writes its own tense bound sentence, which is correct and is exactly why
  // the rent clause escaped: it was written out there in slightly different words.
  // RUN 2 added a FOURTH arm: the one that answers from his confirmed rows rather than from the
  // account age RPC. It carries the clause too, which is the whole point of counting them.
  ok('🔴 ALL FOUR ARMS TAKE THE SAME BRANCH',
    (taxVat.match(/\{rentClause\}/g) || []).length === 4);
  ok('the over the line arm still leads with the shared basis sentence',
    taxVat.includes('{TURNOVER_BASIS_NOTE}{rentClause}'));
  // Three arms print a FIGURE now (over the line, under the line, and the rows answer), and every
  // one of them leads with the shared basis sentence rather than writing its own.
  ok('and every figure arm does', (taxVat.match(/\{TURNOVER_BASIS_NOTE\}\{rentClause\}/g) || []).length === 3);

  // A failed read answers false, which drops one clause from a landlord's screen and never adds a
  // wrong one to anybody's. The unsafe direction is the one that put this bug here.
  const supa = read('lib/supabase.ts');
  const fn = /export async function accountHasRental[\s\S]{0,900}?\n}/.exec(supa)?.[0] ?? '';
  ok('accountHasRental exists and was read', fn.length > 0);
  ok('🔴 AND A READ IT COULD NOT DO ANSWERS false, so the failure drops a clause and never invents one',
    /if \(!res\.ok\) return false;/.test(fn) && /catch \{\s*return false;/.test(fn));
}

console.log('\n--- 4. ONE CLAIM, ONE OWNER. THE TWO RENT SENTENCES CANNOT DISAGREE ---\n');
{
  const vatLib = read('lib/vat.ts');
  ok('🔴 THE CLAUSE IS A CONSTANT IN lib/vat.ts, not a sentence on a screen',
    /export const RENT_NOT_COUNTED_NOTE =/.test(vatLib));
  ok('and the basis sentence no longer carries a clause that is untrue of most readers',
    !/\brent\b/i.test(TURNOVER_BASIS_NOTE));
  ok('while the clause itself still says the thing that is worth saying to a landlord',
    /\brent\b/i.test(RENT_NOT_COUNTED_NOTE) && /exempt/.test(RENT_NOT_COUNTED_NOTE));

  // 🔴 THE DUPLICATE, GONE. The young account arm used to say "It will count the trade income you
  // confirm here and not your rent, which is exempt" in its own hand written words, so one claim
  // existed twice on one screen and the day it turned out to be wrong it had to be fixed twice.
  ok('🔴 NO ARM OF THE PAGE WRITES A RENT SENTENCE OF ITS OWN', !/\brent\b/i.test(taxVat));
  ok('...and the young account arm still keeps the half that is its own, which is why it is not shared',
    /do not log still counts/.test(taxVat) && /under three\s+months old/.test(taxVat));

  // Both sentences ship from the same file, next to each other, because the pair IS the sentence.
  ok('the two constants sit together, so a reader of one meets the other',
    before(vatLib, 'export const TURNOVER_BASIS_NOTE =', 'export const RENT_NOT_COUNTED_NOTE ='));
}

console.log('\n--- 5. A DRILL IS A DRILL WHEREVER IT WAS BOUGHT ---\n');
{
  // 🔴 THE FIVE SHOPS. Named here on purpose: they are the ones inside the materials rule, and
  // they are the reason a tool bought at a tool shop could never be a tool.
  const shops = [
    'SCREWFIX DIRECT LTD',
    'TOOLSTATION 1234',
    'B&Q 1234',
    'WICKES BUILDING SUPPLIES',
    'TRADEPOINT LEEDS',
  ];
  for (const line of shops) {
    ok(`${line}: still materials, because the shop name alone genuinely cannot settle it`,
      categoriseBankLine(line) === 'materials');
    ok(`🔴 ${line}: and tool spend there is DISCOVERABLE as tool spend`,
      couldBeToolSpend(line) === true);
  }
  ok('B & Q written with spaces is the same shop, which is how a bank writes it',
    couldBeToolSpend('B & Q WAREHOUSE') === true && TOOL_AND_MATERIAL_MERCHANTS.test('B & Q WAREHOUSE'));

  ok('a builders merchant is not swept in with them: nobody goes to Jewson for a drill',
    couldBeToolSpend('TRAVIS PERKINS TRADING') === false && couldBeToolSpend('JEWSON LIMITED') === false);
  ok('nor is a hire firm, because a week on a breaker is a running cost and not a tool he owns',
    couldBeToolSpend('HSS HIRE SERVICE') === false);
  ok('nor is anything the map refuses to guess at, which is most of a real statement',
    couldBeToolSpend('AMAZON MKTPLACE UK') === false && couldBeToolSpend('TESCO STORES 3456') === false);
  ok('🔴 HIS OWN ANSWER OUTRANKS THE RULES, BOTH WAYS',
    couldBeToolSpend('SCREWFIX', 'tools') === true && couldBeToolSpend('SCREWFIX', 'fuel') === false);

  // The other half: when the line says what the thing IS, believe the line and not the shop.
  ok('🔴 SCREWFIX SDS DRILL IS A TOOL', categoriseBankLine('SCREWFIX SDS DRILL 280.00') === 'tools');
  ok('🔴 AND SO IS A MAKITA BOUGHT AT B&Q', categoriseBankLine('B&Q MAKITA IMPACT DRIVER') === 'tools');
  ok('and a mitre saw from Toolstation', categoriseBankLine('TOOLSTATION MITRE SAW') === 'tools');
  ok('a brand on its own still lands where it always did',
    categoriseBankLine('MAKITA UK') === 'tools' && categoriseBankLine('DEWALT SERVICE CENTRE') === 'tools');
  ok('and so does a tool shop', categoriseBankLine('MACHINE MART LTD') === 'tools');

  // 🔴 THE GUARD ON THE NEW RULE. Hire is a running cost. A tool word on a hire line must not turn
  // a week's hire into something the capital allowance logic reads as a purchase.
  ok('🔴 HIRE IS STILL HIRE, even with a tool word and a brand on the line',
    categoriseBankLine('SPEEDY HIRE MAKITA BREAKER') === 'equipment'
    && categoriseBankLine('HSS HIRE SERVICE') === 'equipment'
    && categoriseBankLine('ACME SCAFFOLDING HIRE') === 'equipment');

  // The tool words are narrow on purpose. This file's bar is not "usually a tool", it is "so
  // nearly always a tool that a man nodding along is safe".
  ok('no bare "saw", because he also saw Dave about a job',
    categoriseBankLine('saw dave about the job') !== 'tools');
  ok('no bare "grinder", because a cafe buys a coffee one',
    categoriseBankLine('COFFEE GRINDER FOR THE SHOP') !== 'tools');
  ok('and no bare "tool", which is what "tool hire" and TOOLSTATION are made of',
    categoriseBankLine('NATIONAL TOOL HIRE') === 'equipment'
    && categoriseBankLine('TOOLSTATION 1234') === 'materials');
}

console.log('\n--- 6. FIRST MATCH WINS, AND THE RULES NOT TOUCHED STILL ANSWER THE SAME ---\n');
{
  ok('the contract is still written where the map begins',
    /Order matters: the FIRST match wins/.test(cats));
  ok('and the reader still returns on the first rule that matches, in order',
    /for \(const \[re, cat\] of CATEGORY_MAP\) if \(re\.test\(text\)\) return cat;/.test(cats));
  ok('the map is still a real map and not a stub', RULE_COUNT >= 25);

  // 🔴 THE NEW RULE'S POSITION IS THE WHOLE OF ITS BEHAVIOUR. Above the merchants so a tool word
  // beats a shop name. Below fuel, rent, stock and utilities so nothing was taken from them.
  ok('🔴 WORDS ABOUT THE THING ARE READ BEFORE THE NAMES OF SHOPS',
    before(cats, 'WHAT HE BOUGHT, WHICH BEATS WHERE HE BOUGHT IT', '--- MATERIALS: merchants'));
  ok('🔴 AND STILL AFTER THE RULES THAT OWN THEIR OWN WORDS',
    before(cats, '--- FUEL', 'WHAT HE BOUGHT, WHICH BEATS WHERE HE BOUGHT IT')
    && before(cats, '--- STOCK: GOODS FOR RESALE', 'WHAT HE BOUGHT, WHICH BEATS WHERE HE BOUGHT IT')
    && before(cats, '--- RENT: BUSINESS PREMISES ONLY', 'WHAT HE BOUGHT, WHICH BEATS WHERE HE BOUGHT IT'));

  // The refusals come first here for the same reason they do in categories.test.mjs: they matter
  // most. A rule that starts guessing at Amazon walks a birthday present into his tax return.
  const untouched = [
    ['AMAZON MKTPLACE UK', 'other'],
    ['EBAY O*12-34567', 'other'],
    ['PAYPAL *STEVESTOOLS', 'other'],
    ['TESCO STORES 3456', 'other'],
    ['DAVE SMITH', 'other'],
    ['TESCO PETROL FILLING STATION', 'fuel'],
    ['SHELL DAWLISH', 'fuel'],
    ['INSTAVOLT LTD', 'fuel'],
    ['BRITISH GAS BUSINESS', 'utilities'],
    ['THAMES WATER', 'utilities'],
    ['REGUS UK LTD', 'rent'],
    ['BIG YELLOW SELF STORAGE', 'rent'],
    ['BOOKER WHOLESALE', 'stock'],
    ['BIDFOOD', 'stock'],
    ['TRAVIS PERKINS TRADING', 'materials'],
    ['CITY PLUMBING SUPPLIES', 'materials'],
    ['LOCAL TIMBER SUPPLIES', 'materials'],
    ['DVLA VEHICLE TAX', 'van'],
    ['RINGGO PARKING', 'travel'],
    ['GAS SAFE REGISTER', 'training'],
    ['GREGGS', 'meals'],
  ];
  for (const [line, expected] of untouched) {
    ok(`untouched: "${line}" is still ${expected}`, categoriseBankLine(line) === expected);
  }

  // 🔴 THE GUARD THAT MATTERS MOST IN THAT FILE, RESTATED HERE BECAUSE A NEW RULE WAS ADDED ABOVE
  // HALF THE MAP. A rule on the bare word "rent" would claim tax relief on a man's own house.
  ok('🔴 A MAN\'S OWN HOME RENT IS STILL NEVER AUTO CLAIMED AS BUSINESS RENT',
    categoriseBankLine('RENT') !== 'rent' && categoriseBankLine('MONTHLY RENT') !== 'rent'
    && categoriseBankLine('LANDLORD RENT DD') !== 'rent');
  ok('and the trades are still not misfiled to serve the shops',
    categoriseBankLine('GAS FITTINGS LTD') !== 'utilities'
    && categoriseBankLine('ELECTRIC SUPPLIES CO') !== 'utilities');
  ok('an empty line is still other, not a crash', categoriseBankLine('') === 'other');
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
