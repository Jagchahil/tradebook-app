// ONE WAY TO WRITE A POUND, PROVED RATHER THAN CLAIMED. B41, 19 August 2026.
//
//   node test/moneyone.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS, AND IT IS NOT THE OBVIOUS REASON.
//
// lib/money.ts's first line says "ONE WAY TO WRITE A POUND". It was not true. Nine formatters live
// outside it, in seven files, and B41 was written on the belief there were two. Measured at head on
// 19 August the real list is below, and three of the nine were WRONG in the exact way lib/money.ts
// was created on 28 July to stop: the sign inside the pound, "£-1,200.00" on a quarter pack, on an
// invoice PDF going out under our user's own business name, and on the pay yourself advice.
//
// They are copies rather than imports for one stated reason each, and the reason is always the same
// shape: the module is STAGED BY A SUITE with a hand written dependency list, and
// test/capitalwiring.test.mjs pins lib/quarterpack.ts's list at exactly two relative imports. So
// importing lib/money.ts into them would rewrite six staging blocks to delete a duplicate that
// behaves identically. That is a trade, and the honest half of it is this suite: the duplication
// stays and the DRIFT is what gets checked, on every gate run, in about a millisecond.
//
// ⚠️ IT CHECKS BEHAVIOUR, NOT TEXT. Each copy's body is lifted out of its own source and run as a
// function against lib/money.ts's real one over a table with a negative, a zero, a fraction, a
// thousands boundary and a non number. A reformat cannot fool it and a comment cannot satisfy it.
//
// ⚠️ AND IT PROVES ITSELF FIRST. Section 0 feeds the comparator a body that is deliberately wrong
// and fails if the comparator calls it equal. A guard that cannot see a difference reports zero
// differences for ever, which is how the nine got here.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// lib/money.ts is pure and import free, so it goes on the bench whole.
const stage = mkdtempSync(path.join(tmpdir(), 'moneyone-'));
writeFileSync(path.join(stage, 'money.ts'), read('lib/money.ts'));
const M = await import(pathToFileURL(path.join(stage, 'money.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ---------------------------------------------------------------------------------------------
// THE TABLE. Every value that has ever told two formatters apart in this repo.
// ---------------------------------------------------------------------------------------------
const TABLE = [
  0, -0, 1, -1, 33, -33, 0.4, -0.4, 0.5, 33.33, -33.33, 53.4, 120, -120,
  152.4, 450, 999.995, 1000, 1200, -1200, 1034.3, 22910, 22910.5, 26065,
  -1200.005, 1e6, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
];

// Lift a one argument formatter out of TypeScript source and make it callable. The bodies here use
// nothing but Number, Math and toLocaleString, all of which are globals, so no scope is needed.
function lift(src, name) {
  // function NAME(p: T): T { ... }
  let m = src.match(new RegExp(`function\\s+${name}\\s*\\(\\s*([A-Za-z_$][\\w$]*)[^)]*\\)\\s*(?::[^{]+)?\\{`));
  let bodyStart;
  let param;
  if (m) { param = m[1]; bodyStart = m.index + m[0].length - 1; }
  else {
    // const NAME = (p: T): T => { ... }   or   const NAME = (p: T) => <expression>;
    m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\(\\s*([A-Za-z_$][\\w$]*)[^)]*\\)\\s*(?::[^=]+)?=>\\s*`));
    if (!m) throw new Error(`NOT FOUND: ${name}`);
    param = m[1];
    const after = m.index + m[0].length;
    if (src[after] === '{') bodyStart = after;
    else {
      // An expression body, terminated by the semicolon at depth zero outside any string.
      let j = after, depth = 0;
      for (; j < src.length; j++) {
        const c = src[j];
        if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
        if (c === '"' || c === "'" || c === '`') {
          const q = c;
          for (j++; j < src.length; j++) { if (src[j] === '\\') j++; else if (src[j] === q) break; }
          continue;
        }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ';' && depth === 0) break;
      }
      return new Function(param, `return (${src.slice(after, j)});`);
    }
  }
  // Brace matched body, skipping strings so a } inside a template cannot end it early.
  let depth = 0, end = -1;
  for (let j = bodyStart; j < src.length; j++) {
    const c = src[j];
    // ⚠️ COMMENTS ARE SKIPPED FIRST. An apostrophe in "a loss year's document" reads as a string
    // opener and swallows every brace after it, which lifted lib/incomeproof.ts's NEXT function.
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j + 2) + 1; if (j < 1) break; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (j++; j < src.length; j++) { if (src[j] === '\\') j++; else if (src[j] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) throw new Error(`UNTERMINATED: ${name}`);
  return new Function(param, src.slice(bodyStart + 1, end));
}

const agree = (a, b) => TABLE.every((n) => a(n) === b(n));
const firstDisagreement = (a, b) => {
  for (const n of TABLE) if (a(n) !== b(n)) return `${n}: ${a(n)} vs ${b(n)}`;
  return null;
};

// ---------------------------------------------------------------------------------------------
// 0. THE COMPARATOR CAN SEE A DIFFERENCE. Everything below is worthless without this.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 0. the comparator is not vacuous ===\n');
{
  const CANON = 'function f(n) { const v = Number.isFinite(n) ? n : 0; const r = Math.round(v) || 0;'
    + ' const abs = Math.abs(r).toLocaleString("en-GB"); return r < 0 ? `-£${abs}` : `£${abs}`; }';
  const WRONG = 'function f(n) { return "£" + Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-GB"); }';
  ok('a lifted body that matches gbp0 is called equal', agree(lift(CANON, 'f'), M.gbp0));
  ok('🔴 AND THE ONE WITH THE SIGN INSIDE THE POUND IS NOT, which is the whole defect class',
    !agree(lift(WRONG, 'f'), M.gbp0));
  ok('🔴 AND THE TABLE CONTAINS A NEGATIVE, or the line above passes by luck',
    TABLE.some((n) => Number.isFinite(n) && n < 0));
  ok('🔴 AND A FRACTION, or gbp0 and gbp2 could never be told apart', TABLE.some((n) => n % 1 !== 0));
  ok('gbp0 and gbp2 are themselves different functions', !agree(M.gbp0, M.gbp2));
  const expr = 'const g = (n) => `£${Math.round(Math.abs(Number.isFinite(n) ? n : 0)).toLocaleString("en-GB")}`;';
  ok('an expression bodied arrow lifts as well as a braced one', agree(lift(expr, 'g'), M.gbpAbs0));
}

// ---------------------------------------------------------------------------------------------
// 1. EVERY COPY, AGAINST THE ONE IT IS A COPY OF. Derived at head on 19 August 2026.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. every formatter outside lib/money.ts ===\n');
const COPIES = [
  { file: 'lib/waintents.ts',   name: 'formatGbp', canon: 'gbpAbs2', why: 'the chat, and it is exported' },
  { file: 'lib/waintents.ts',   name: 'gbpShort',  canon: 'gbpAbs0', why: 'the statutory student loan threshold' },
  { file: 'lib/waintents.ts',   name: 'gbpOwed',   canon: 'gbpOwed', why: 'the WhatsApp invoice chaser' },
  { file: 'lib/quarterpack.ts', name: 'gbp',       canon: 'gbp2',    why: 'the quarter pack document' },
  { file: 'lib/invoicepdf.ts',  name: 'gbp',       canon: 'gbp2',    why: 'the invoice PDF' },
  { file: 'lib/incomeproof.ts', name: 'gbp',       canon: 'gbp2',    why: 'proof of income' },
  { file: 'lib/trialnudge.ts',  name: 'gbp',       canon: 'gbp0',    why: 'the trial emails' },
  { file: 'lib/payyourself.ts', name: 'money',     canon: 'gbp0',    why: 'the pay yourself advice' },
];
for (const c of COPIES) {
  const lifted = lift(read(c.file), c.name);
  const canon = M[c.canon];
  const d = firstDisagreement(lifted, canon);
  ok(`${c.file} ${c.name} is ${c.canon} exactly (${c.why})${d ? ` [${d}]` : ''}`, d === null);
}

// ---------------------------------------------------------------------------------------------
// 1a. THE LIST IS DERIVED, NOT DECLARED. `COPIES.length === 8` would assert my own array back at
// me, which is a comment wearing an assertion's clothes. This walks the tree instead: anything
// shaped like a money formatter must either delegate to lib/money.ts, be one of the copies above,
// or be on the exclusion list WITH a reason. A ninth copy fails this line by existing.
// ---------------------------------------------------------------------------------------------
const EXCLUDED = new Map([
  ['app/how-mtd-works/page.tsx:money', 'a slider label inside an inline browser script, prints "£90k+" from thousands, not a pound'],
  ['lib/vat.ts:money', 'returns a NUMBER, not a string: it rounds pence, it does not format them'],
]);
const DELEGATES = /\b(gbp0|gbp2|gbpAbs0|gbpAbs2|gbpOwed)\s*\(/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(path.relative(root, full));
  }
  return out;
}

{
  const named = new Set(COPIES.map((c) => `${c.file}:${c.name}`));
  const strays = [];
  for (const rel of [...walk(path.join(root, 'lib')), ...walk(path.join(root, 'app'))]) {
    if (rel === 'lib/money.ts') continue;
    const src = read(rel);
    const decl = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*(?::[^=]+)?=>)/g;
    // ⚠️ EACH REGION ENDS AT THE NEXT DECLARATION. A fixed window ran past the end of a short
    // function and attributed the NEXT one's pound to it, which named safeEqual as a formatter.
    const found = [];
    let m;
    while ((m = decl.exec(src))) {
      const params = (m[2] ?? m[4] ?? m[5] ?? '').trim();
      found.push({ name: m[1] || m[3], at: m.index, arity: params === '' ? 0 : params.split(',').length });
    }
    for (let i = 0; i < found.length; i++) {
      const { name, at, arity } = found[i];
      const region = src.slice(at, i + 1 < found.length ? found[i + 1].at : Math.min(src.length, at + 2000));
      // ⚠️ A FORMATTER, NOT A SENTENCE THAT CONTAINS ONE. This item is about NAMED, REUSABLE, one
      // argument money formatters, because those are what drift apart from each other unseen. An
      // inline `£${amount.toFixed(2)}` inside a builder that also does five other things is a real
      // and separate defect, it is FILED IN THE BACKLOG rather than smuggled onto an exclusion
      // list here, and there were 26 of them at head on 19 August 2026.
      if (arity !== 1) continue;
      if (region.length > 500) continue;
      if (!/£\$\{[^}]*(?:toLocaleString|toFixed)|['"]£['"]\s*\+[^;\n]*(?:toLocaleString|toFixed)/.test(region)) continue;
      const key = `${rel}:${name}`;
      if (named.has(key) || EXCLUDED.has(key)) continue;
      if (DELEGATES.test(region)) continue;
      strays.push(key);
    }
  }
  ok(`🔴 THE LIST IS DERIVED AND COMPLETE${strays.length ? ` [stray: ${strays.join(', ')}]` : ''}`,
    strays.length === 0);
  ok('🔴 AND THE WALKER ACTUALLY FOUND THE COPIES, or it is finding nothing and calling it clean',
    walk(path.join(root, 'lib')).length > 40 && read('lib/waintents.ts').includes('formatGbp'));
}

// ---------------------------------------------------------------------------------------------
// 2. THE DOCTRINE LINE IN lib/money.ts DESCRIBES THE CODE, WHICH IS WHERE THIS STARTED.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. the header is true ===\n');
{
  const money = read('lib/money.ts');
  ok('🔴 IT NO LONGER CLAIMS TO BE THE ONLY PLACE A POUND IS WRITTEN',
    !/^\/\/ lib\/money\.ts\. ONE WAY TO WRITE A POUND\.$/m.test(money));
  ok('it names the copies that exist and the suite that pins them',
    /moneyone\.test\.mjs/.test(money) && /lib\/waintents\.ts/.test(money) && /lib\/quarterpack\.ts/.test(money));
  ok('🔴 AND IT SAYS HOW MANY, so a reader cannot conclude there are two again',
    /EIGHT|eight/.test(money));
  ok('gbpOwed lives here rather than privately in one of its two callers',
    /export function gbpOwed/.test(money));
}

// ---------------------------------------------------------------------------------------------
// 3. THE TWO CHASER VOICES, AT A FIGURE WHERE THE DIFFERENCE CAN SHOW.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. one man, one voice, at every total ===\n');
{
  const wa = lift(read('lib/waintents.ts'), 'gbpOwed');
  ok('a whole pound total prints whole pounds on both', wa(450) === M.gbpOwed(450) && wa(450) === '£450');
  ok('🔴 AND £152.40 PRINTS £152.40 ON BOTH, which is the figure the parity test never tried',
    wa(152.4) === M.gbpOwed(152.4) && wa(152.4) === '£152.40');
  ok('🔴 never £152, which invites a payment 40p short', wa(152.4) !== '£152');
  ok('and a thousand pound invoice keeps its separator', M.gbpOwed(1234.5) === '£1,234.50');
}

// ---------------------------------------------------------------------------------------------
// 4. THE COSTUME BELONGS TO THE FIGURE, NOT THE DOOR. B37 and B39, 19 August 2026.
//
// B26 settled the Self Assessment bill and the set aside. These are the rest of them, and the rule
// runs in BOTH directions, which is the half that keeps getting lost: the customer's own money
// prints pence on every surface, and a figure written by Parliament prints whole pounds on every
// surface, because the law writes £26,065 and not £26,065.00.
//
// Asserted on the SOURCE rather than on rendered output because these are server components: the
// question "which formatter does this figure wear" is answered at the call site and nowhere else.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. one figure, one costume, on every door ===\n');
{
  const HIS_MONEY = [
    ['app/app/page.tsx', ['gbp2(moneyIn)', 'gbp2(moneyOut)', 'gbp2(profit)', 'gbp2(week.income)', 'gbp2(week.expenses)', 'gbp2(weekProfit)']],
    ['app/app/money/page.tsx', ['gbp2(log.income)', 'gbp2(log.expenses)', 'gbp2(log.profit)', 'gbp2(log.capitalCost)']],
    // ⚠️ THE THREE SCREENS ABOVE ARE B37's. THE THREE BELOW ARE B38's, AND B38 NAMED ONLY TWO OF
    // THEM: /app/money's own entry list printed `gbp0(e.amount)` too, a third screen showing the
    // same row as the other two, and it was found by walking rather than by reading the item.

    ['app/app/tax/summary/page.tsx', ['gbp2(sub.trade.income)', 'gbp2(sub.trade.expenses)', 'gbp2(sub.trade.net)', 'gbp2(sub.trade.capitalCost)', 'gbp2(sub.cisSuffered)', 'gbp2(pack.trade.net)']],
    ['app/app/tax/ni/page.tsx', ['gbp2(ni.class4)', 'gbp2(ni.class1)', 'gbp2(ni.class2Voluntary.annual)', 'gbp2(profit)']],
    ['app/app/tax/student-loan/page.tsx', ['gbp2(tax.studentLoan)']],
    // B38. A RECORD OF MONEY THAT MOVED. This is the one place whole pounds LOSES information a
    // customer needs: a row he is reconciling against his bank statement has real pence in it, and
    // /app/pile is the screen where he says yes to it. The VAT on the same row was already printed
    // to the penny two lines below the gross, on one screen, before this.
    ['app/app/entry/page.tsx', ['gbp2(entry.amount)', 'gbp2(cost)']],
    ['app/app/pile/page.tsx', ['gbp2(v.gross)', 'gbp2(g.total)', 'uncertainAmountLine(gbp2(g.total))']],
    ['app/app/money/page.tsx', ['gbp2(e.amount)']],
  ];
  for (const [file, sites] of HIS_MONEY) {
    const src = read(file);
    const missing = sites.filter((c) => !src.includes(c));
    ok(`${file}: his own money prints pence${missing.length ? ` [whole pounds again: ${missing.join(', ')}]` : ''}`,
      missing.length === 0);
  }

  // ⚠️ AND THE OTHER DIRECTION, WHICH IS WHY THIS IS NOT SIMPLY "NO gbp0 ANYWHERE". These are the
  // statutory ones and they must NOT move. B39's own item warned about the student loan threshold
  // and the CHAT was the surface printing it wrongly, at two decimal places, not the web.
  const STATUTE = [
    ['app/app/tax/ni/page.tsx', ['gbp0(FACTS.class4LowerLimit)', 'gbp0(FACTS.class4UpperLimit)', 'gbp0(FACTS.class2SmallProfitsThreshold)', 'gbp0(NI_FACTS.class1LowerEarningsLimit)']],
    ['app/app/tax/student-loan/page.tsx', ['gbp0(plan.threshold)']],
    ['app/app/tax/summary/page.tsx', ['gbp0(pack.ytd.mtdThreshold)']],
  ];
  for (const [file, sites] of STATUTE) {
    const src = read(file);
    const moved = sites.filter((c) => !src.includes(c));
    ok(`${file}: the law's own figures stay whole pounds${moved.length ? ` [moved: ${moved.join(', ')}]` : ''}`,
      moved.length === 0);
  }

  // ⚠️ AND ON THE THREE RECORD SCREENS THE ASSERTION IS AN ABSENCE, NOT A PRESENCE, BECAUSE A
  // PRESENCE CHECK SURVIVED THE SABOTAGE. Putting `{gbp2(g.total)}` back to `{gbp0(g.total)}` on
  // /app/pile left `uncertainAmountLine(gbp2(g.total))` untouched, so `includes('gbp2(g.total)')`
  // went on passing while six visible amounts had lost their pence. Found by the pass, not by
  // reading. Nothing statutory is drawn on these three screens: they show records of money that
  // moved, so whole pounds has no business on any of them.
  for (const file of ['app/app/entry/page.tsx', 'app/app/pile/page.tsx', 'app/app/money/page.tsx']) {
    ok(`${file}: a record of money that moved never wears whole pounds`,
      !/\bgbp0\s*\(/.test(read(file)));
  }

  const wa = read('lib/waintents.ts');
  ok('🔴 THE CHAT PRINTS HIS INCOME TO THE PENNY AND THE THRESHOLD IN WHOLE POUNDS, IN ONE SENTENCE',
    wa.includes('your income this tax year (${formatGbp(input.income)})')
    && wa.includes('threshold of ${gbpShort(input.threshold)}'));
  ok('🔴 AND THE ONLY CALLER OF gbpShort IS THAT THRESHOLD, so a figure of his cannot slip into it',
    (wa.match(/gbpShort\(/g) || []).length === 1);
  ok('the Sunday digest gives the week the same costume the chat gives it',
    /return gbpAbs2\(n\);/.test(read('lib/weeklyupdate.ts')));
  ok('🔴 AND THE VAT REGISTRATION THRESHOLD IN THAT SAME MESSAGE STAYS STATUTORY',
    /VAT registration threshold/.test(read('lib/weeklyupdate.ts'))
    && /\$\{gbp\(threshold\)\}/.test(read('lib/weeklyupdate.ts')));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
