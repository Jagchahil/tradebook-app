// THE ONE DOOR ONTO HIS FIGURES, AND WHAT A PAGE SAYS WHEN IT WILL NOT OPEN. B24, 19 August 2026.
//
//   node test/optimiserdoor.test.mjs
//
// ═════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS.
//
// getOptimiserInput fails in TWO shapes and eleven pages asked about neither.
//
//   1. IT THROWS, and a server rendered page hands him a Next error boundary.
//   2. IT RESOLVES CARRYING rowsUnreadable, which does NOT throw, and hands back the same object
//      with every figure of his at zero.
//
// Shape 2 is the one that did the damage, because it is invisible. A man whose database was
// unreadable for ten seconds opened his Tax page and read that he had earned nothing, spent
// nothing and owed nothing, in the same confident type the true figures wear. lib/taxoptimiser.ts
// wrote the cost down on the day the field was added and nobody had come back for it.
//
// ⚠️ AND THE THING THIS SUITE REFUSES TO DO IS HOLD A LIST OF ELEVEN. B24 exists because a list
// was how the doors were counted, and a list of eleven is wrong the first time somebody adds a
// twelfth. So section 3 DERIVES the callers off disk and requires EVERY page among them to reach
// the signed line. A twelfth page that reaches it passes without anybody editing this file, and a
// twelfth that does not goes red on the gate that same minute.
//
// ⚠️ AND IT PROVES THE INSTRUMENT FIRST. Section 0 feeds the very same scanner a planted page that
// calls the reader and never reaches the line, and fails if the scanner calls it clean. A scanner
// that cannot see a miss reports zero misses for ever, which is exactly how eleven bare doors got
// to production.
// ═════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// lib/waintents.ts is deliberately import free, which is why it can be loaded and RUN here rather
// than only scanned. Section 5d needs the real builder, not a regex over its source.
const W = await import(`${pathToFileURL(path.join(root, 'lib/waintents.ts')).href}`);

// Every product file under app/ and lib/, for the "typed exactly once" count. Derived by walking,
// never by naming a file, because a second copy of a signed sentence arrives in a file nobody
// thought to list.
const walkFiles = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};
const productFiles = [...walkFiles(path.join(root, 'app')), ...walkFiles(path.join(root, 'lib'))];

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

// Assert on the CODE, never on the prose around it. Safe form of the line comment strip, so a
// `https://` inside a string is not truncated: this repo has been bitten by the naive one four
// times. JSX block comments come out too, because a page's argument for its own guard is written
// in one and must not be able to satisfy the guard.
const codeOnly = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── THE SCANNER, WRITTEN AS A PURE FUNCTION SO SECTION 0 CAN PROVE IT BITES ──────────────────
//
// A file is a DOOR if its code calls either name. It is a PAGE door or a ROUTE door by the file
// name Next itself gives them, which is a fact about the framework rather than a list we keep.
const CALLS_READER = /(?:getOptimiserInput|readOptimiserOrNull)\s*\(/;
const REACHES_LINE = /RecordsUnreadable/;

const isDoor = (code) => CALLS_READER.test(code);
const pageMissesTheLine = (file, code) => file.endsWith('page.tsx') && isDoor(code) && !REACHES_LINE.test(code);

// ── 0. THE INSTRUMENT, BEFORE ANY VERDICT ────────────────────────────────────────────────────
{
  const planted = 'const optimiser = await readOptimiserOrNull(user.id);\nreturn <main>{gbp0(0)}</main>;';
  ok('🔴 the scanner SEES a page door that never reaches the line',
    pageMissesTheLine('app/app/planted/page.tsx', planted) === true);
  ok('🔴 ...and clears the same page once it does',
    pageMissesTheLine('app/app/planted/page.tsx', `${planted}\nif (!optimiser) return <RecordsUnreadable current="/app" />;`) === false);
  ok('🔴 ...and a mention in a COMMENT is not a call, so codeOnly is doing work',
    isDoor(codeOnly('// getOptimiserInput(user.id) is what this used to do\nconst x = 1;')) === false);
  ok('🔴 ...and the line inside a JSX comment does not clear a door',
    pageMissesTheLine('app/app/planted/page.tsx', codeOnly(`${planted}\n{/* RecordsUnreadable would go here */}`)) === true);
  ok('🔴 ...and a ROUTE is never judged by the page rule, or the count in section 5 is a lie',
    pageMissesTheLine('app/api/planted/route.ts', planted) === false);
}

// ── 1. THE SENTENCE, VERBATIM, AND IT LIVES ONCE ─────────────────────────────────────────────
//
// Signed by delegation on 18 August 2026 and recorded in the backlog in these exact words. It is
// asserted character for character because it is customer copy: a session may not soften it,
// lengthen it or add a promise to it without Jag signing the new one.
const SIGNED = 'Lekhio could not read your records just now, so this page is not showing figures. Nothing has happened to your books. Refresh in a minute.';
const componentSrc = read('app/app/RecordsUnreadable.tsx');
{
  ok('🔴 the signed line is in RecordsUnreadable.tsx, character for character',
    componentSrc.includes(SIGNED));
  ok('🔴 ...as the ONE exported constant, so no door can carry its own copy',
    /export const RECORDS_UNREADABLE_LINE = '/.test(codeOnly(componentSrc)));
  ok('🔴 ...and it says nothing has happened to his books, which is the half that stops him panicking',
    SIGNED.includes('Nothing has happened to your books.'));
  ok('🔴 ...and it tells him when to come back rather than offering him a button to press',
    SIGNED.includes('Refresh in a minute.') && !/<button/i.test(codeOnly(componentSrc)));
  // The component is the only route to the sentence, so a page reaching the component reaches it.
  ok('🔴 the component renders the constant rather than a second copy of the words',
    /\{RECORDS_UNREADABLE_LINE\}/.test(codeOnly(componentSrc)));
  ok('🔴 ...and it keeps the nav, so the one screen telling him something broke does not strand him',
    /<AppNav/.test(codeOnly(componentSrc)));
  // The whole estate, so a second wording cannot appear anywhere and quietly diverge.
  const carriers = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      // Dot directories are tooling, never product source, and app/.node holds broken symlinks
      // that make a naive stat walk die rather than report.
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
      if (read(rel).includes('could not read your records just now')) carriers.push(rel);
    }
  };
  walk('app'); walk('lib');
  // ⚠️ TIGHTENED 19 AUGUST 2026 BY B50, AND THE OLD FORM WAS TOO LOOSE RATHER THAN STALE.
  //
  // This assertion matched the FRAGMENT "could not read your records just now" and required exactly
  // one file to carry it. B50 then added the signed CHAT line, which deliberately mirrors this one
  // and shares that fragment, so the guard went red on a second sentence it was never about. The
  // INTENT (this page sentence is typed once) is unchanged and correct. The implementation is now
  // the WHOLE sentence, which is strictly stronger, and the fragment watch is kept as its own
  // assertion at TWO, so a THIRD wording of the same idea still reddens the gate.
  const pageCarriers = carriers.filter((rel) => read(rel).includes(SIGNED));
  ok('🔴 the PAGE sentence is typed in exactly ONE file in app/ and lib/, derived',
    pageCarriers.length === 1 && pageCarriers[0] === 'app/app/RecordsUnreadable.tsx');
  ok('🔴 ...and exactly TWO files in the estate speak about an unreadable read at all, the page'
    + ' component and the chat copy module. A third is a third wording and must not arrive quietly',
    carriers.length === 2 && carriers.includes('app/app/RecordsUnreadable.tsx')
    && carriers.includes('lib/waintents.ts'));
}

// ── 2. THE DOOR BEHAVES, AND THIS IS BEHAVIOUR RATHER THAN SPELLING ──────────────────────────
//
// readOptimiserOrNull's own body is lifted out of lib/supabase.ts and RUN, with getOptimiserInput
// injected, against the two failure shapes and a good read. A comment cannot satisfy this and a
// rename cannot break it. B41's lesson, applied to a door instead of to a formatter.
const supabaseSrc = read('lib/supabase.ts');
{
  const at = supabaseSrc.indexOf('export async function readOptimiserOrNull(');
  ok('🔴 readOptimiserOrNull exists in lib/supabase.ts', at !== -1);

  const open = supabaseSrc.indexOf('{', at);
  const end = supabaseSrc.indexOf('\n}', open);
  const body = supabaseSrc.slice(open + 1, end);
  ok('🔴 ...and its body could be lifted whole', body.includes('return input'));

  const build = (stub) => new Function('getOptimiserInput', `return async function readOptimiserOrNull(userId) {${body.replace(/:\s*OptimiserInput[^\n]*/g, '')}\n}`)(stub);

  const thrower = build(async () => { throw new Error('fetch failed'); });
  const unreadable = build(async () => ({ rowsUnreadable: true, ytdTradeIncome: 0, ytdTradeExpenses: 0 }));
  const good = build(async () => ({ rowsUnreadable: false, ytdTradeIncome: 4081.8, ytdTradeExpenses: 12 }));
  const results = await Promise.all([thrower('u'), unreadable('u'), good('u')]);

  ok('🔴 SHAPE 1, A THROWN READ, comes back as null rather than as an error boundary',
    results[0] === null);
  ok('🔴 SHAPE 2, rowsUnreadable, comes back as null rather than as a year of zeros',
    results[1] === null);
  ok('🔴 ...and a read that WORKED is handed straight through, untouched',
    results[2] !== null && results[2].ytdTradeIncome === 4081.8);
  // The vacuity check on this section: a door that returned null for everything would pass the two
  // above and be useless, and a door that returned the object for everything would pass the third.
  ok('🔴 ...so the door can tell the three apart, which is the only thing that makes it a door',
    results[0] === null && results[1] === null && results[2] !== null);
}

// ── 3. EVERY PAGE DOOR REACHES THE LINE. DERIVED OFF DISK, NEVER LISTED ──────────────────────
const doors = [];
{
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      // Same rule as section 1's walk, and for the same reason: a dot directory is tooling.
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
      const code = codeOnly(read(rel));
      if (isDoor(code)) doors.push({ rel, code, raw: read(rel) });
    }
  };
  walk('app');

  const pages = doors.filter((d) => d.rel.endsWith('page.tsx'));
  const routes = doors.filter((d) => d.rel.endsWith('route.ts'));

  // The floor, not the number. It stops a broken walk reporting "all clear" over an empty set,
  // and it deliberately does NOT pin eleven, because a twelfth page is allowed to exist.
  ok('🔴 the walk found the page doors at all, so a silent empty set cannot pass as clean',
    pages.length >= 11);
  ok('🔴 ...and every other file under app/ is accounted for as a page or a route',
    pages.length + routes.length === doors.length);

  const missing = pages.filter((d) => pageMissesTheLine(d.rel, d.code)).map((d) => d.rel);
  ok(`🔴 EVERY page door reaches the signed line, all ${pages.length} of them, derived (${missing.join(', ') || 'none missing'})`,
    missing.length === 0);

  // And not through a lookalike: each one names the component this suite has just proved carries
  // the constant, so there is exactly one wording in the product.
  const byName = pages.filter((d) => /RecordsUnreadable/.test(d.code) && /from '[^']*RecordsUnreadable'/.test(d.code));
  ok('🔴 ...and every one of them imports it from app/app/RecordsUnreadable, not a local copy',
    byName.length === pages.length);

  // The old bare name is gone from the pages entirely, so nobody can add a twelfth by copying a
  // sibling that still calls the raw read.
  const raw = pages.filter((d) => /getOptimiserInput\s*\(/.test(d.code)).map((d) => d.rel);
  ok(`🔴 no page calls the raw getOptimiserInput any more (${raw.join(', ') || 'none'})`,
    raw.length === 0);

  // 🔴 INSTEAD OF THE FIGURES, NEVER AS WELL AS THEM, AND THAT IS A DIFFERENT ASSERTION.
  //
  // A page that printed the line at the bottom of a screen of zeros would satisfy every check
  // above and would be the original fault with an apology stapled to it. So the line has to sit
  // where the null is: an early RETURN, or a ternary ARM. Both shapes are walked by a real page,
  // which is this file's own rule about unexercised alternatives: the return by the ten screens
  // whose figures ARE the page, the arm by /app/setup, which is mid signup and still owes him the
  // step he is standing on.
  //
  // ⚠️ AND IT MATCHES THE SHAPE RATHER THAN THE LOCAL'S NAME. Pinning `optimiser` would make a
  // rename go red, and a guard that a rename can break is a guard about a name.
  const PLACED = /(?:if \(!\w+\)\s*return\s*<RecordsUnreadable|\w+ === null \? \(\s*<RecordsUnreadable)/;
  const misplaced = pages.filter((d) => !PLACED.test(d.code)).map((d) => d.rel);
  ok(`🔴 every page shows the line INSTEAD of its figures, at the null, not underneath them (${misplaced.join(', ') || 'all placed'})`,
    misplaced.length === 0);
  ok('🔴 ...and BOTH placements are really used, so neither alternative is a hole with a name',
    pages.some((d) => /if \(!\w+\)\s*return\s*<RecordsUnreadable/.test(d.code))
    && pages.some((d) => /\w+ === null \? \(\s*<RecordsUnreadable/.test(d.code)));
}

// ── 4. THE ROUTES, COUNTED. THE COUNT IS THE TRIPWIRE, SECTION 5 IS THE RULE ─────────────────
//
// 🔴 SEVEN ROUTE FILES HOLD THIRTEEN CALLS, measured at head on 19 August 2026 when B24 shipped and
// RE DERIVED at head on the same day when B50 closed. B24 left them deliberately, because the
// signed sentence it shipped is a PAGE sentence: it says "this page is not showing figures", and no
// JSON endpoint, WhatsApp reply or chat answer can say it. B50 wrote the two sentences that path
// needed, Jag signed them, and section 5 below is the rule they are held to.
//
// ⚠️ THE COUNT STAYS PINNED, AND ONLY THE COUNT. A fourteenth route call reddens this on the gate
// the minute it is written, and whoever wrote it has to decide rather than inherit a silence. That
// is the whole lesson of B24 applied one level up: the thing that rots is an unwatched number.
{
  const routes = doors.filter((d) => d.rel.endsWith('route.ts'));
  const calls = routes.reduce((n, d) => n + (d.code.match(CALLS_READER) ? d.code.match(/(?:getOptimiserInput|readOptimiserOrNull)\s*\(/g).length : 0), 0);
  ok(`🔴 seven route files hold the optimiser read, derived (${routes.length})`, routes.length === 7);
  ok(`🔴 ...and thirteen calls between them, the number the decision was made on (${calls})`, calls === 13);
}


// ── 5. THE ROUTES, WIRED. EVERY ONE EITHER SAYS THE LINE OR SAYS WHY NOT. B50, 19 August 2026 ──
//
// 🔴 THE RULE IS THE SHAPE, NOT A LIST. Every file under app/api/ that reads the optimiser must
// either REACH the signed chat line or carry a written RECORDS UNREADABLE EXEMPT reason naming what
// it does instead. Nothing here names a route, so an eighth route file arrives at this rule the day
// it is written rather than being inherited into a silence.
//
// ⚠️ AND THE SCANNER IS PROVED TO BITE BEFORE ITS ZERO IS BELIEVED. Section 5b runs the same
// function over a synthetic route that does neither, and requires it to be REPORTED. A scanner that
// cannot see a miss reports no misses for ever.
{
  const CHAT_LINE = 'I could not read your records just now, so I cannot give you a figure. Nothing has happened to your books. Ask me again in a minute.';
  // 🔴 THE REASON MUST BE ON THE MARKER'S OWN LINE, AND THIS PASS'S OWN SABOTAGE FOUND WHY.
  // The first draft was \s*, which matches a NEWLINE, so a bare marker with the reason pushed onto
  // the next line satisfied it. That is a rubber stamp with extra steps. [ \t]* keeps the match on
  // the line the marker is written on, and the length floor stops a one word reason counting as
  // one. A length floor is a weak instrument and this file says so out loud rather than pretending
  // otherwise: what it can actually stop is an empty marker, and that is what it is for.
  const EXEMPT = /RECORDS UNREADABLE EXEMPT:[ \t]*(\S[^\n]*)/;
  const hasReason = (code) => { const m = EXEMPT.exec(code); return m !== null && m[1].trim().length >= 40; };

  // The rule, as a pure function of one file's code, so section 5b can hand it anything.
  const routeMisses = (code) => isDoor(code) && !/RECORDS_UNREADABLE_CHAT_LINE/.test(code) && !hasReason(code);

  const routes = doors.filter((d) => d.rel.startsWith('app/api/') && d.rel.endsWith('route.ts'));
  const missing = routes.filter((d) => routeMisses(d.raw)).map((d) => d.rel);
  ok(`🔴 EVERY ROUTE THAT READS THE OPTIMISER EITHER SAYS THE LINE OR SAYS WHY NOT (${missing.join(', ') || 'all answered'})`,
    missing.length === 0);

  // ⚠️ BOTH ARMS ARE REALLY USED, so neither is a hole with a name on it.
  ok('🔴 ...and BOTH arms are exercised: some routes reach the constant and some carry a reason',
    routes.some((d) => /RECORDS_UNREADABLE_CHAT_LINE/.test(d.raw))
    && routes.some((d) => hasReason(d.raw)));

  // ── 5b. VACUITY. THE SCANNER CAN SEE A MISS. ────────────────────────────────────────────
  const SYNTH_BAD = "export async function GET() { const i = await getOptimiserInput(u); return NextResponse.json(i); }";
  const SYNTH_LINE = SYNTH_BAD.replace('return NextResponse.json(i);', 'if (!i) return RECORDS_UNREADABLE_CHAT_LINE;');
  const SYNTH_EXEMPT = "// RECORDS UNREADABLE EXEMPT: a cron whose whole read is already in a try that falls to an honest empty.\n" + SYNTH_BAD;
  const SYNTH_BARE = "// RECORDS UNREADABLE EXEMPT:\n// the reason has been pushed onto the next line, which is a bare marker.\n" + SYNTH_BAD;
  ok('🔴 THE ROUTE SCANNER REPORTS A ROUTE THAT DOES NEITHER, without which the zero above is vacuous',
    routeMisses(SYNTH_BAD) === true);
  ok('and it does NOT report one that reaches the constant', routeMisses(SYNTH_LINE) === false);
  ok('and it does NOT report one that carries a written reason', routeMisses(SYNTH_EXEMPT) === false);
  ok('🔴 AND IT REPORTS A BARE MARKER WITH THE REASON PUSHED ONTO THE NEXT LINE. This one is not'
    + ' hypothetical: the first draft of this rule used \\s*, which matches a newline, and the pass'
    + ' below caught it',
    routeMisses(SYNTH_BARE) === true);
  ok('and it ignores a file that never reads the optimiser at all',
    routeMisses('export async function GET() { return NextResponse.json({ ok: true }); }') === false);

  // ── 5c. THE SIGNED LINE IS TYPED ONCE IN THE WHOLE ESTATE. ─────────────────────────────
  //
  // Two wordings is the drift this corpus keeps deleting, and the cheapest way to get two is to
  // paste the first. The count is derived by walking app/ and lib/, never by naming a file.
  const chatFiles = productFiles.filter((p) => readFileSync(p, 'utf8').includes(CHAT_LINE));
  ok(`🔴 THE SIGNED CHAT LINE IS TYPED IN EXACTLY ONE FILE UNDER app/ AND lib/ (${chatFiles.length})`,
    chatFiles.length === 1);
  ok('🔴 ...and that file is lib/waintents.ts, which is the chat copy module both channels read',
    chatFiles.length === 1 && chatFiles[0].endsWith(path.join('lib', 'waintents.ts')));
  ok('🔴 AND IT IS THE SIGNED WORDS, BYTE FOR BYTE, with no dash of any kind in it',
    W.RECORDS_UNREADABLE_CHAT_LINE === CHAT_LINE && !/[-–—]/.test(CHAT_LINE));
  ok('⚠️ and it is NOT the page line: they mirror each other and they are not the same sentence,'
    + ' because a page is not a chat and neither may be sent on the other',
    W.RECORDS_UNREADABLE_CHAT_LINE !== SIGNED);

  // ── 5d. BEHAVIOUR. THE REAL BUILDER, RUN. ──────────────────────────────────────────────
  //
  // 🔴 THE GENERAL HALF SURVIVES, WHICH IS THE WHOLE DECISION. A man comparing a van on a bad ten
  // seconds keeps the two routes and the irreversible lock in, and loses only the clause built out
  // of his own books, with the reason said out loud where that clause was.
  const unread = W.vehicleAnswer({ boughtThroughBooks: true, allowanceThisYear: 4200, recordsUnreadable: true });
  const good = W.vehicleAnswer({ boughtThroughBooks: true, allowanceThisYear: 4200 });
  const none = W.vehicleAnswer({ boughtThroughBooks: false, allowanceThisYear: 0 });
  ok('🔴 A FAILED READ ON THE VEHICLE LANE SAYS THE SIGNED LINE', unread.includes(CHAT_LINE));
  ok('🔴 ...and KEEPS the general half, the two routes and the irreversible lock in',
    /two ways to run a vehicle/.test(unread) && /cannot switch that vehicle to mileage later/.test(unread));
  ok('🔴 ...and says NOTHING about his own books, which is the claim that was being made out of zeros',
    !/vehicle in your books already/.test(unread) && !/4,200/.test(unread));
  ok('🔴 A GOOD READ IS UNTOUCHED and still names his own allowance, so this is not a guard that'
    + ' refuses everybody',
    /vehicle in your books already/.test(good) && /4,200/.test(good) && !good.includes(CHAT_LINE));
  ok('🔴 AND A GOOD READ WITH NO VEHICLE NEVER APOLOGISES. "no vehicle" and "could not look" were'
    + ' the same answer before today and they are two answers now',
    !none.includes(CHAT_LINE) && !/vehicle in your books already/.test(none)
    && /two ways to run a vehicle/.test(none) && none !== unread);

  // ── 5e. WIRE THREE AND SAY THREE. ──────────────────────────────────────────────────────
  //
  // The vehicle lane is on all three answering routers and all three now pass recordsUnreadable.
  // ⚠️ THE OWE LANE IS ON TWO, AND THAT IS PINNED RATHER THAN FIXED HERE. matchTotalsQuestion is
  // called in whatsapp and in thread and ZERO times in ask, which is B58 and is a behaviour change
  // on the most consequential answer in the product. This session did not wire it and says so, and
  // the pin is here so the gap cannot close or widen in the dark.
  const routeSrc = {
    whatsapp: read('app/api/whatsapp/route.ts'),
    thread: read('app/api/thread/route.ts'),
    ask: read('app/api/ask/route.ts'),
  };
  const vehicleWired = Object.entries(routeSrc).filter(([, s]) => /recordsUnreadable:/.test(codeOnly(s))).map(([k]) => k);
  ok(`🔴 THE VEHICLE LANE PASSES recordsUnreadable ON ALL THREE ROUTERS (${vehicleWired.join(', ')})`,
    vehicleWired.length === 3);
  const oweWired = Object.entries(routeSrc).filter(([, s]) => /matchTotalsQuestion\s*\(/.test(codeOnly(s))).map(([k]) => k);
  ok(`⚠️ THE OWE LANE IS ON TWO ROUTERS AND NOT THREE, WHICH IS B58 AND IS NOT THIS SESSION'S`
    + ` (${oweWired.join(', ')})`,
    oweWired.length === 2 && oweWired.includes('whatsapp') && oweWired.includes('thread'));
  // ⚠️ THE LOCAL IS \w+ ON PURPOSE. Pinning the name `optimiser` would make a rename go red, and a
  // guard a rename can break is a guard about a name. Section 3's placement rule is written the
  // same way for the same reason, and sabotage-b24optimiserdoor carries a rename control.
  ok('🔴 ...and BOTH routers that have the owe lane answer a failed read with the signed line',
    /if \(!\w+\) return RECORDS_UNREADABLE_CHAT_LINE;/.test(codeOnly(routeSrc.thread))
    && /sendText\(from, RECORDS_UNREADABLE_CHAT_LINE\)/.test(codeOnly(routeSrc.whatsapp)));

  // ── 5f. THE JSON ROUTES ANSWER WITH AN ERROR, NOT WITH A BODY OF ZEROS. ────────────────
  //
  // D3: no customer sentence exists on these paths and none is written. What is asserted is that
  // each one STOPS at the null rather than carrying on into an assembly of his figures.
  for (const rel of ['app/api/ledger/route.ts', 'app/api/optimise/route.ts', 'app/api/elections/route.ts']) {
    const c = codeOnly(read(rel));
    ok(`🔴 ${rel} answers an unreadable read with an explicit 503 rather than a body of zeros`,
      /if \(!\w+\) return NextResponse\.json\(\{ error: 'unreadable' \}, \{ status: 503 \}\);/.test(c));
    ok(`🔴 ...and ${rel} no longer reads the optimiser bare`, !/\bgetOptimiserInput\s*\(/.test(c));
  }
}


// ── 6. THE VEHICLE PAGE KEEPS ITS GENERAL HALF. B51, DECISION D2, 19 August 2026 ─────────────
//
// 🔴 THIS SCREEN IS A CALCULATOR AND B24 WAS TAKING ALL OF IT. Its comparison is the published
// 2026/27 rules against a price HE TYPED: the two routes, what each is worth as a deduction, and
// the one irreversible thing in the whole answer. None of that needs a row out of his books. D2
// keeps it and withholds ONLY the recommendation, with the signed line where his figures were.
//
// 🔴 AND THE OTHER DIRECTION IS THE DANGEROUS ONE, WHICH IS WHY BOTH ARE ASSERTED. Keeping the page
// up means recommendVehicle is standing there ready to be called, and mRate is declared at 0. A
// marginalRate of 0 lights noTaxToSaveYet, which prints "On the figures you have confirmed you have
// no tax to pay this year": a claim about HIS tax, made out of a database that did not answer. That
// is the exact disease B24 exists to kill. Section 6b proves the zero really does light it, and
// then proves the page cannot reach it.
{
  const VEH = 'app/app/tax/vehicle/page.tsx';
  const vehRaw = read(VEH);
  const vehCode = codeOnly(vehRaw);

  // The local the read is bound to, derived, so a rename is a rename and not a red test.
  const bound = /const\s+\[\s*(\w+)[\s\S]{0,120}?\]\s*=\s*await\s+Promise\.all\(\[\s*readOptimiserOrNull\(/.exec(vehCode);
  ok('🔴 the vehicle page still reads through the ONE door, and the local it binds is derived here'
    + ' rather than typed, so a rename cannot red this section',
    bound !== null);
  const LOCAL = bound ? bound[1] : '__none__';

  // ── 6a. THE GENERAL HALF IS OUTSIDE THE FORK. ──────────────────────────────────────────
  ok('🔴 THE PAGE NO LONGER RETURNS THE WHOLE SCREEN ON A NULL READ, which is what cost a man the'
    + ' comparison he came for',
    !/if \(!\w+\) return <RecordsUnreadable/.test(vehCode));
  ok('🔴 ...and it DOES still place the signed line at the null, as a ternary arm',
    new RegExp(`${LOCAL} === null \\? \\(\\s*<RecordsUnreadable`).test(vehCode));
  ok('🔴 ...and the line it shows is the PAGE line through the shared component, inline, never a'
    + ' second wording and never the chat one',
    /<RecordsUnreadable inline \/>/.test(vehCode) && !vehRaw.includes('RECORDS_UNREADABLE_CHAT_LINE'));

  // 🔴 NOTHING ABOVE THE FORM MAY DEPEND ON THE READ. That is the general half stated as a
  // property rather than as a list of sentences: the header, the lede naming the two routes and
  // the once per vehicle fork, and all seven questions are rendered before the read is ever
  // consulted, so a failed read cannot reach them.
  const jsx = vehCode.slice(vehCode.indexOf('return ('));
  const aboveForm = jsx.slice(0, jsx.indexOf('</form>'));
  ok('🔴 NOT ONE THING ABOVE THE FORM DEPENDS ON THE READ, so the two routes, the lock in and all'
    + ' seven questions survive it',
    aboveForm.length > 500 && !new RegExp(`\\b${LOCAL}\\b`).test(aboveForm));
  ok('🔴 ...and that slice really is the top of the page, not an empty string flattering itself',
    /<form method="get"/.test(aboveForm) && /lek-h1/.test(aboveForm));

  // ⚠️ AND IT IS SHOWN ONLY WHEN HE ASKED. doc 103's empty test: a card that says "nothing to
  // check" most of the time teaches him to stop looking, and then he misses the day it matters.
  const answerCard = jsx.slice(jsx.indexOf('What each one is worth'));
  ok('🔴 THE WITHHELD CARD IS GATED ON HIM HAVING ASKED, never shown to a man who has typed nothing',
    /\{answered \? \(/.test(jsx)
    && jsx.indexOf('{answered ? (') < jsx.indexOf('What each one is worth')
    && answerCard.length > 200);

  // ── 6b. THE ZERO, IN BOTH DIRECTIONS. ──────────────────────────────────────────────────
  //
  // The shape first: the call is guarded, derived off the declaration that makes it.
  const recDecl = vehCode.slice(vehCode.lastIndexOf('const ', vehCode.indexOf('recommendVehicle({')), vehCode.indexOf('recommendVehicle({'));
  ok('🔴 recommendVehicle IS NOT CALLED AT ALL ON A NULL READ, so marginalRate: 0 cannot reach it',
    new RegExp(`${LOCAL} !== null`).test(recDecl));
  ok('🔴 ...and the guard is on the SAME declaration that makes the recommendation, not somewhere'
    + ' else in the file where a later edit could separate them',
    recDecl.length < 400 && /\?$|\?\s*$/.test(recDecl.trimEnd()));

  // Then the behaviour, because a shape assertion about a danger nobody has measured is prose.
  const capStage = mkdtempSync(path.join(tmpdir(), 'b51cap-'));
  for (const f of readdirSync(path.join(root, 'lib'))) {
    if (f.endsWith('.ts')) {
      writeFileSync(path.join(capStage, f),
        read(`lib/${f}`).replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'"));
    }
  }
  const CAP = await import(pathToFileURL(path.join(capStage, 'capital.ts')).href);
  const ASK = {
    want: 'car', budget: 40000, businessMilesPerYear: 9000, businessUsePct: 100,
    runningCostsPerYear: 4000, charging: 'home', spendable: 22000,
  };
  const atZero = CAP.recommendVehicle({ ...ASK, marginalRate: 0 });
  const atReal = CAP.recommendVehicle({ ...ASK, marginalRate: 0.26 });
  ok('🔴 A marginalRate OF 0 REALLY DOES LIGHT noTaxToSaveYet. Without this the guard above is a'
    + ' shape assertion about a danger nobody measured',
    atZero.noTaxToSaveYet === true);
  ok('🔴 ...and a real marginal rate does NOT light it, so the flag is not simply always on',
    atReal.noTaxToSaveYet === false);
  // ⚠️ WHITESPACE NORMALISED, because the sentence is wrapped across source lines and a guard that
  // pins the wrapping is a guard about an indent. It is the WORDS that must not be printable off a
  // read that did not answer.
  ok('🔴 ...and the sentence it lights is a claim about HIS tax, which is why it may never be'
    + ' printed off a read that did not answer',
    vehRaw.replace(/\s+/g, ' ')
      .includes('you have confirmed you have no tax to pay this year'));

  // ⚠️ AND THE GENERAL HALF REALLY IS GENERAL, PROVED RATHER THAN ASSERTED: the same question at
  // two different marginal rates gives the SAME deductions and the SAME irreversible fork. Only
  // what it is worth in tax moves. That is the measurement behind D2's decision.
  const dedAt = (r) => r.options.map((o) => `${o.kind}:${o.firstYear}:${o.mileageFirstYear}`).join('|');
  ok('🔴 THE DEDUCTIONS AND THE ROUTES DO NOT MOVE WITH HIS MARGINAL RATE, which is the whole'
    + ' argument for keeping this half up when his books cannot be read',
    dedAt(atZero) === dedAt(atReal) && dedAt(atZero).length > 20);
  ok('🔴 ...and what he is worth in TAX does move, so the two halves really are two halves',
    atZero.options.map((o) => o.worthPerYearOne).join('|')
    !== atReal.options.map((o) => o.worthPerYearOne).join('|'));
  rmSync(capStage, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
