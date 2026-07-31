// WAVE NINE: THE TAX SCREENS STOP TELLING A DIRECTOR HE IS A SOLE TRADER.
// Run: node test/wave9_mtdstructure.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// FOUR THINGS A LIMITED COMPANY DIRECTOR WAS TOLD ON 31 JULY 2026, ON SCREENS HE PAYS FOR, AND
// ONE MORE A LANDLORD WAS OFFERED THAT HE CANNOT BUY:
//
//   1. "MAKING TAX DIGITAL APPLIES TO YOU", on /app/tax, gated on nothing but a turnover test.
//      Making Tax Digital for Income Tax is a Self Assessment regime: it covers self employment
//      and rent on a personal return, and a company's trade is neither, because the company files
//      its own return. Worse, the turnover it was tested on was the COMPANY's, which is not his
//      qualifying income at all.
//
//   2. "SELF ASSESSMENT COLLECTS IT IN ONE BILL", and a payments on account card. Payments on
//      account are TMA 1970 s59A, a Self Assessment mechanism with no counterpart in Corporation
//      Tax. There was nothing true to put in their place, so the honest answer was to put nothing.
//
//   3. AN ENTIRE PAGE ADDRESSED TO AN MTD FILER. /app/tax/summary told him what a quarterly update
//      would report, which update of the year it was, when it was due, and promised he would
//      approve the figures before anything went. He makes no update. His own figures survive,
//      because arithmetic over his book is his whatever return it lands on; the framing goes.
//
//   4. CLASS 4 AND VOLUNTARY CLASS 2. Both are National Insurance on a TRADE. Neither touches a
//      company's profit: a director pays Class 1 primary on his salary and the company pays
//      Class 1 secondary. /app/tax/ni priced Class 4 off the company's profit and offered him the
//      voluntary Class 2 tick.
//
//   5. AND THE SAME CLASS 2 OFFER WENT TO A LANDLORD. HMRC's NIM74250: "A person whose activities
//      in managing the property are those generally associated with being a landlord would not
//      meet the definition of gainful employment for self-employed NICs purposes." No relevant
//      profits, no small profits threshold to fall under, and no Class 2 at a few pounds a week.
//      His route to a qualifying year is Class 3, at several times the cost. The same manual page
//      carries the exception that makes caution right, so the copy keeps it: a guest house or a
//      hotel IS a trade.
//
// 🔴 AND THE RULE THAT OUTRANKS ALL FIVE: UNKNOWN SHOWS EVERYTHING. A profile read that fails
// returns null, an unset structure column reads as sole trader, and an income shape we were never
// told is null. Every gate below is proved against those fixtures, by running THE PAGE'S OWN
// EXPRESSION, because withholding a real obligation or a real relief from a sole trader over a
// timed out read is by far the worse failure of the two.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments stripped before asking what a CUSTOMER reads, as everywhere else in this directory:
// these files argue at length about the sentences they refuse to say, and a guard that cannot tell
// the argument from the sentence gets switched off rather than fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flat = (s) => s.replace(/\s+/g, ' ');

// ⚠️ THE GATES ARE RUN, NOT READ. A test that retypes `businessType === 'limited_company'` proves
// only that the test can type it. This lifts the page's own `const NAME = ...;` out of the source
// and executes it against fixtures, so the truth table below is the screen's, and a rewrite that
// quietly widens a gate fails here rather than on a customer.
function gates(src, names, scope) {
  try {
    const decls = names.map((n) => {
      const m = src.match(new RegExp(`\\bconst ${n} = ([^;]+);`));
      if (!m) throw new Error(`no declaration of ${n}`);
      return `const ${n} = ${m[1]};`;
    });
    const args = Object.keys(scope);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...args, `${decls.join('\n')}\nreturn { ${names.join(', ')} };`);
    return fn(...args.map((a) => scope[a]));
  } catch {
    return null;
  }
}

// The `{cond ? ( ... )` arm that starts at `marker`, matched by walking brackets rather than by a
// regex, because these arms hold JSX with parentheses of its own inside it.
function arm(src, marker, from = 0) {
  const i = src.indexOf(marker, from);
  if (i < 0) return null;
  let depth = 1;
  for (let j = i + marker.length; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') { depth--; if (depth === 0) return src.slice(i + marker.length, j); }
  }
  return null;
}

// What is left of a page once the gated arms are cut out of it: what a man OUTSIDE those branches
// reads. The cheapest way to prove a sentence cannot reach the wrong customer.
const without = (src, arms) => arms.reduce((acc, a) => (a ? acc.split(a).join(' ') : acc), codeOnly(src));

// The people. An unset business_type column reads as sole trader (getBusinessProfile's own
// default), so "unknown structure" is not observable downstream and only an explicit company ever
// loses anything. Unknown INCOME SHAPE is observable, and it is null.
const NOBODY = null; // the profile read failed outright
const SOLE_UNKNOWN = { businessType: 'sole_trader', partnershipShare: 100, incomeShape: null };
const SOLE_TRADE = { businessType: 'sole_trader', partnershipShare: 100, incomeShape: 'trade' };
const PARTNER = { businessType: 'partnership', partnershipShare: 50, incomeShape: 'trade' };
const LANDLORD = { businessType: 'sole_trader', partnershipShare: 100, incomeShape: 'property_only' };
const DIRECTOR = { businessType: 'limited_company', partnershipShare: 100, incomeShape: 'trade' };
const DIRECTOR_UNKNOWN = { businessType: 'limited_company', partnershipShare: 100, incomeShape: null };

const hub = read('app/app/tax/page.tsx');
const summary = read('app/app/tax/summary/page.tsx');
const ni = read('app/app/tax/ni/page.tsx');
const nav = read('app/app/AppNav.tsx');
const setup = read('app/app/setup/page.tsx');

console.log('\nwave nine: MTD, payments on account and National Insurance belong to somebody');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE TAX HUB. The MTD row and the January mechanics are Self Assessment, so they are his
//       or they are not drawn.
// ---------------------------------------------------------------------------------------------
{
  ok('the hub reads who he is from getBusinessProfile, and a failed read is null, never a throw',
    hub.includes('getBusinessProfile(user.id)') && /getBusinessProfile\(user\.id\)\.catch\(\(\) => null\)/.test(hub));

  const over = { ytd: { mtdApplies: true } };
  const under = { ytd: { mtdApplies: false } };
  const g = (biz, pack) => gates(hub, ['isCompany', 'mtd'], { biz, pack });
  ok('the hub still has the two gates this suite is about', g(NOBODY, over) !== null);

  ok('🔴 A DIRECTOR OVER THE TURNOVER LINE IS NOT TOLD MAKING TAX DIGITAL APPLIES TO HIM',
    g(DIRECTOR, over).mtd === false && g(DIRECTOR_UNKNOWN, over).mtd === false);
  ok('🔴 AND A SOLE TRADER OVER IT STILL IS: nothing was taken from the man the row was built for',
    g(SOLE_TRADE, over).mtd === true && g(SOLE_UNKNOWN, over).mtd === true);
  ok('a partner keeps it too, because his share IS self employment income',
    g(PARTNER, over).mtd === true);
  ok('🔴 A FAILED PROFILE READ KEEPS THE ROW: unknown shows everything, which is the safe direction',
    g(NOBODY, over).mtd === true);
  ok('a landlord keeps it, because rent on a personal return counts towards the same line',
    g(LANDLORD, over).mtd === true);
  ok('and the turnover test still decides for everybody under it',
    g(SOLE_TRADE, under).mtd === false && g(NOBODY, under).mtd === false);
  ok('the structure gate bites on an explicit company and on nothing else',
    g(DIRECTOR, over).isCompany === true
    && [NOBODY, SOLE_UNKNOWN, SOLE_TRADE, PARTNER, LANDLORD].every((b) => g(b, over).isCompany === false));

  // The row itself is untouched: this is a gate, not a rewrite of what a mandated man reads.
  const mtdRow = arm(hub, '{mtd ? (');
  ok('the MTD row is still drawn from the quarter pack for the man it is his',
    typeof mtdRow === 'string' && /Making Tax Digital applies to you/.test(flat(mtdRow))
    && /pack\.ytd\.grossQualifyingIncome/.test(mtdRow));
  ok('🔴 and no other sentence on the hub asserts mandation outside that gate',
    !/Making Tax Digital|quarterly updates apply/.test(flat(without(hub, [mtdRow]))));

  // Payments on account, TMA 1970 s59A. A Self Assessment mechanism, gated the same way.
  const poaCard = arm(hub, '{showPosition && !isCompany && poa.required ? (');
  ok('🔴 THE PAYMENTS ON ACCOUNT CARD IS GATED ON THE STRUCTURE AS WELL AS ON THE ENGINE',
    typeof poaCard === 'string' && /payments on\s+account/.test(poaCard));
  ok('and the engine still decides for everyone else: poa.required is untouched',
    /paymentsOnAccount\(tax\.selfAssessmentTax/.test(hub) && /poa\.required \? \(/.test(hub));
  ok('🔴 A DIRECTOR IS NOT TOLD ABOUT PAYMENTS ON ACCOUNT ANYWHERE ELSE ON THE PAGE',
    !/payments on account/i.test(flat(without(hub, [poaCard]))));

  // The January sentence under the number, which is a Self Assessment sentence.
  ok('🔴 THE JANUARY DATE IS BEHIND THE SAME BRANCH, not printed at a man who has no January date',
    /\{isCompany \? null : <>\{' '\}Self Assessment collects it/.test(hub));
  const heroCap = arm(hub, '{isCompany ? (');
  ok('and the absence is explained in the words setup already uses, rather than left as a gap',
    typeof heroCap === 'string' && /company files its own return/.test(flat(heroCap)));
  ok('🔴 NOTHING IS INVENTED IN ITS PLACE: no Corporation Tax deadline, no company figure',
    !/Corporation Tax/i.test(flat(codeOnly(hub))));
  ok('the door down to the quarter still opens for him, under a name that is true for him',
    /href="\/app\/tax\/summary"/.test(hub) && /isCompany\s*\?\s*'Your figures since 6 April/.test(flat(hub)));
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE QUARTERLY SUMMARY. An honest top for a director, and his own figures kept.
// ---------------------------------------------------------------------------------------------
{
  ok('the summary reads the profile too, with the same catch to null',
    /getBusinessProfile\(user\.id\)\.catch\(\(\) => null\)/.test(summary));
  const g = (biz) => gates(summary, ['isCompany'], { biz });
  ok('and its gate bites on an explicit company only',
    g(DIRECTOR).isCompany === true && g(DIRECTOR_UNKNOWN).isCompany === true
    && [NOBODY, SOLE_UNKNOWN, SOLE_TRADE, PARTNER, LANDLORD].every((b) => g(b).isCompany === false));

  ok('🔴 THE PAGE NO LONGER ADDRESSES EVERY READER AS AN MTD FILER: the heading is branched',
    /\{isCompany \? '[^']+' : 'What a quarterly update would report today'\}/.test(flat(summary)));
  ok('and a sole trader still reads the cumulative argument, word for word',
    /restates the whole year/.test(flat(summary)) && /pack\.submission/.test(summary));

  const top = arm(summary, '{isCompany ? (');
  ok('🔴 THE DIRECTOR IS TOLD PLAINLY WHY IT IS NOT AN UPDATE, in the reasoning setup already gives',
    typeof top === 'string'
    && /self employment and rent on a personal return/.test(flat(top))
    && /the company files its own return/.test(flat(top)));
  ok('🔴 AND THAT REASONING IS ONE FACT, NOT TWO: the setup MTD step says the same thing',
    /self employment and rent on a personal return/.test(flat(setup))
    && /the company files its own return/.test(flat(setup)));
  ok('it names the window it is showing him rather than passing the tax year off as his accounts',
    /accounting period/.test(flat(top)));

  // What survives for him, and it is only ever arithmetic over his own confirmed entries.
  ok('his own figures are kept: the same submission block, unbranched',
    /sub\.trade\.income/.test(summary) && /sub\.trade\.expenses/.test(summary) && /sub\.trade\.net/.test(summary));
  ok('the property figures are kept too, and only the claim about what an UPDATE does with them moves',
    /isCompany\s*\?\s*'Rent is kept as its own stream/.test(flat(summary))
    && /An update carries property as its own stream/.test(flat(summary)));

  // The calendar card is a due date for a return he does not file.
  const cal = summary.indexOf('The {ordinal} update of');
  ok('🔴 THE DUE DATE CARD IS WITHHELD WHOLE, rather than filled in with an invented deadline',
    cal > -1 && /\{isCompany \? null : \(/.test(summary.slice(Math.max(0, cal - 500), cal)));
  ok('and it still draws for the man who does make an update',
    /updateDue\(startYear, index\)/.test(summary) && /UPDATE_ORDINAL\[index\]/.test(summary));
  ok('🔴 NO CORPORATION TAX DEADLINE IS INVENTED IN ITS PLACE',
    !/Corporation Tax/i.test(flat(codeOnly(summary))));

  // The filing promise. Kept for a filer, and never aimed at a man who files nothing here.
  const foot = arm(summary, '{isCompany ? (', summary.indexOf('THE HONEST LINE ABOUT FILING'));
  ok('the standing honesty is still said to everyone: nothing has been sent anywhere',
    typeof foot === 'string' && /Nothing on this page has been sent anywhere/.test(flat(foot))
    && /Nothing on this page has been sent anywhere/.test(flat(summary)));
  ok('🔴 BUT THE APPROVAL PROMISE IS MADE TO THE MAN WHO WILL HAVE AN UPDATE TO APPROVE',
    !/approve them before anything goes/.test(flat(foot))
    && /approve them before anything goes/.test(flat(summary))
    && /cannot send an update to HMRC yet/.test(flat(summary)));
  ok('and the company footer claims no filing of any kind',
    !/\bfile\b|\bsubmit\b|\bHMRC\b/i.test(flat(foot)));
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. NATIONAL INSURANCE. Two axes, because Class 4 and Class 2 both belong to a trade.
// ---------------------------------------------------------------------------------------------
{
  ok('the NI page reads the profile, with the same catch to null',
    /getBusinessProfile\(user\.id\)\.catch\(\(\) => null\)/.test(ni));
  const g = (biz) => gates(ni, ['isCompany', 'propertyOnly', 'hasTradeNic'], { biz });
  ok('the NI page still has all three gates', g(NOBODY) !== null);

  ok('🔴 A DIRECTOR HAS NO TRADE NATIONAL INSURANCE: neither class touches the company profit',
    g(DIRECTOR).hasTradeNic === false && g(DIRECTOR_UNKNOWN).hasTradeNic === false);
  ok('🔴 NOR DOES A LANDLORD WITH NO TRADE (NIM74250: not gainful employment for self employed NICs)',
    g(LANDLORD).hasTradeNic === false);
  ok('🔴 A SOLE TRADER KEEPS EVERYTHING HE HAD, and so does a partner',
    g(SOLE_TRADE).hasTradeNic === true && g(PARTNER).hasTradeNic === true);
  ok('🔴 AN UNKNOWN INCOME SHAPE KEEPS TODAY\'S PAGE: a null shape is not a landlord',
    g(SOLE_UNKNOWN).hasTradeNic === true);
  ok('🔴 AND A FAILED READ KEEPS IT TOO: a missed Class 2 year cannot be bought back later',
    g(NOBODY).hasTradeNic === true);
  ok('the two axes are independent and each bites on an explicit answer only',
    g(LANDLORD).isCompany === false && g(DIRECTOR).propertyOnly === false
    && g(SOLE_UNKNOWN).propertyOnly === false);

  // Class 4, priced off a profit that has to be his.
  const class4 = arm(ni, '{hasTradeNic ? (', ni.indexOf('CLASS 4.'));
  ok('🔴 THE CLASS 4 CARD IS DRAWN ONLY FOR A MAN WHOSE TRADE PROFIT IT IS CHARGED ON',
    typeof class4 === 'string' && /Class 4 so far this year/.test(class4) && /ni\.class4/.test(class4));
  ok('🔴 AND NO CLASS 4 BASE IS SHOWN OUTSIDE IT',
    !/Class 4 so far this year/.test(without(ni, [class4])) && !/ni\.class4\b/.test(without(ni, [class4])));
  ok('the thresholds inside it are still the engine\'s, printed by name',
    /FACTS\.class4LowerLimit/.test(class4) && /FACTS\.class4UpperLimit/.test(class4)
    && /asPercent\(FACTS\.class4MainRate\)/.test(class4));

  // Class 2, the voluntary one, and the two men who cannot buy it.
  const stateP = arm(ni, '{hasTradeNic ? (', ni.indexOf('CLASS 2.'));
  ok('the trade chain is untouched: all four of its arms are still there, in order',
    typeof stateP === 'string'
    && /ni\.qualifiesViaProfits \? \(/.test(stateP)
    && /ni\.qualifiesViaEmployment \? \(/.test(stateP)
    && /ni\.voluntaryClass2Suggested \? \(/.test(stateP)
    && /Nothing to weigh up yet/.test(stateP));
  ok('🔴 THE VOLUNTARY CLASS 2 OFFER IS INSIDE THAT CHAIN AND NOWHERE ELSE',
    /Class 2 voluntarily/.test(stateP)
    && !/Class 2 voluntarily/.test(without(ni, [stateP]))
    && !/class2Voluntary\.weeklyRate/.test(without(ni, [stateP])));
  ok('and it still prices itself from the engine, never from the page',
    /ni\.class2Voluntary\.weeklyRate/.test(stateP) && /FACTS\.class2SmallProfitsThreshold/.test(stateP));

  const outside = flat(without(ni, [class4, stateP]));
  ok('🔴 THE DIRECTOR IS TOLD WHOSE THE TWO CLASSES ARE, and that his salary is where Class 1 sits',
    /Neither touches your company/.test(outside) && /Class 1/.test(outside));
  ok('🔴 AND HE IS NEVER OFFERED THE VOLUNTARY TICK: Class 2 belongs to a trade',
    /Class 2 belongs to a trade/.test(outside) && !/pay\s+Class 2 voluntarily/.test(outside));
  ok('🔴 THE LANDLORD IS TOLD THERE IS NO CLASS 2 FOR HIM, AND WHAT THE REAL ROUTE COSTS',
    /no Class 2 to pay/.test(outside) && /Class 3/.test(outside) && /costs several times more/.test(outside));
  ok('with NIM74250\'s own exception kept, because a guest house IS a trade',
    /guest house/.test(outside) && /hotel/.test(outside));
  ok('and no invented figure comes with any of it: no rate, no weekly price, no threshold',
    !/£/.test(outside));

  // The wages sentence is true for a director on his own payroll and for a landlord with a job, so
  // it is kept for both, and written once.
  ok('a year bought by wages is still said to everyone it is true of, from one string',
    /const viaWages = /.test(ni) && (ni.match(/\{viaWages\}/g) || []).length === 2
    && /NI_FACTS\.class1LowerEarningsLimit/.test(ni));
  ok('🔴 the annual maximum is gated too: it stacks Class 1 on Class 4, and there is no Class 4',
    /hasTradeNic && ni\.annualMaximaMayApply/.test(ni));
  ok('the employed block itself is untouched, because Class 1 on a payslip is his either way',
    /salary > 0 \? \(/.test(ni) && /ni\.class1/.test(ni));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE RAIL. It advertised an MTD update to every customer on every page.
// ---------------------------------------------------------------------------------------------
{
  const block = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
  ok('🔴 THE NAV NO LONGER PROMISES AN MTD UPDATE TO A MAN WHO MAKES NONE',
    !/MTD update would report/.test(codeOnly(block)));
  ok('the row itself stays, because the figures behind it are his money added up',
    /href: '\/app\/tax\/summary', label: 'Quarterly summary'/.test(block));
  ok('and its hint names what the page shows, which is true for every structure',
    /hint: 'Your figures since 6 April, and the quarter on its own'/.test(block));
  // ⚠️ THE TRADE OFF, PINNED SO THE NEXT PERSON KNOWS IT WAS A CHOICE. SECTIONS is a static const,
  // rendered twice from one list and read as source text by five other suites, and AppNav is given
  // no customer to look up. Withholding a row from a director means rebuilding the nav, and the
  // page behind this one now tells him the truth in full. So the hint was made honest instead.
  ok('SECTIONS is still one static list rendered twice, which is why the row could not be withheld',
    /export const SECTIONS: ReadonlyArray<NavSection> = \[/.test(nav)
    && (nav.match(/SECTIONS\.map/g) || []).length === 2
    && !/AppNav\({ current, /.test(nav));
}

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE HOUSE RULES, ON THE THREE SCREENS THIS TOUCHED.
// ---------------------------------------------------------------------------------------------
for (const [name, src] of [['hub', hub], ['summary', summary], ['ni', ni], ['nav', nav]]) {
  ok(`${name}: still server rendered, no client script`,
    !/'use client'|onClick|onChange|useState/.test(src));
  ok(`${name}: no em dash, no en dash`, !/[—–]/.test(src));
  ok(`${name}: claims no filing and no HMRC blessing`,
    !/\bwe\s+(will\s+)?file\b/i.test(flat(codeOnly(src)))
    && !/HMRC[\s-]*(approved|accredited|certified|endorsed|recognised)/i.test(flat(codeOnly(src))));
  ok(`${name}: carries no tax constant of its own`,
    !/(?<![\d.])(12570|50270|37700|125140)(?![\d.])/.test(codeOnly(src)));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
