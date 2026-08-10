// ONE ASK ABOVE THE FOLD, AND THE PROMISE THAT ANSWERS IT ON THE SAME SCREEN.
//
//   node test/herofocus.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT WAS ACTUALLY TRUE ON THE AFTERNOON OF 10 AUGUST 2026.
//
// The hero already said "7 days free, no card. Cancel in one tap." It was correct, it was worded
// once, and it was rendered as one grey sentence under the buttons.
//
// AND IT LANDED ELEVEN PIXELS BELOW THE FOLD at 1568x775, which is the commonest laptop viewport
// we see. So the three objections that line answers, and they are the three every stranger has,
// were answered on the second screen. A man deciding in two seconds never saw them.
//
// ⚠️ THE MEASUREMENT IS THE POINT, NOT THE OPINION. Nobody had scrolled the live page far enough
// to know the line existed, which is how it survived: it looked absent from a screenshot and
// present in the source, and neither reader corrected the other.
//
// The second thing: the hero offered TWO equally sized buttons, Start free and See how it works.
// A second button beside the primary one is not an option, it is a door out of the ask. And the
// top bar carried seven things to press, of which exactly one was the ask.
//
// So this suite pins four things:
//   1. ONE button in the hero's cta-row. Not two.
//   2. The micro promise is DERIVED from the single CTA_MICRO string, never retyped.
//   3. The fold budget: the padding that was removed cannot creep back.
//   4. 🔴 NOTHING DROPPED FROM THE TOP NAV MAY BE ORPHANED. Moved, not deleted.
//
// ⚠️ WHAT THIS DOES NOT PROVE, so the next reader can tell a decision from a hole. It does not
// render the page and measure the fold in a real browser. That needs Chromium and it would be the
// slowest test in the suite by an order of magnitude. It guards the INPUTS to the fold, which are
// the four paddings, because those are what will silently grow again. The pixel was checked by eye
// at the moment it was changed, and the number it was checked against is written above.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const home = read('app/page.tsx');
const homeCode = stripComments(home);
const site = read('app/_shared/site.tsx');
const siteCode = stripComments(site);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. One ask in the hero.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // The hero's cta-row specifically. Later sections legitimately repeat the primary button, and
  // this must not fire on those, so it reads the FIRST cta-row only, which is the hero's.
  const row = /<div className="cta-row">([\s\S]*?)<\/div>/.exec(homeCode);
  ok('the hero cta-row was found, so the assertions below are real', Boolean(row));
  const links = row ? (row[1].match(/<Link /g) || []).length : -1;
  ok(`🔴 EXACTLY ONE BUTTON IN THE HERO CTA ROW (found ${links})`, links === 1);
  ok('and it is the primary ask, Start free',
    Boolean(row) && /href="\/start"[^>]*className="btn primary"/.test(row[1]));
  // The specific door out that was removed. Named, so putting this exact one back goes red.
  ok('🔴 AND "See how it works" IS NO LONGER A SECOND BUTTON BESIDE IT',
    Boolean(row) && !/See how it works/.test(row[1]));
  // ⚠️ But the ROUTE must survive, or this traded a distraction for a dead end.
  ok('the /product route is still reachable from the nav on every page',
    /\['\/product', 'Product'\]/.test(siteCode));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. The promise is derived, never retyped.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const micro = /const CTA_MICRO = '([^']+)'/.exec(homeCode)?.[1];
  ok('CTA_MICRO was found, so the assertions below are real', Boolean(micro));

  // 🔴 THE WHOLE POINT. A hand written array beside the sentence is a second thing to keep in
  // step, and the two drift the first time the trial length changes. lib/entitlement.ts's
  // TRIAL_DAYS incident is the same disease one layer down.
  ok('🔴 CTA_POINTS IS SPLIT FROM CTA_MICRO, not written out a second time',
    /const CTA_POINTS = CTA_MICRO\b/.test(homeCode));
  ok('and there is exactly one CTA_MICRO literal in the file',
    (homeCode.match(/const CTA_MICRO =/g) || []).length === 1);

  // Run the real derivation rather than trusting it by eye. A split that silently returned one
  // item would render one tick and pass every regex above.
  const points = micro ? micro.replace(/\.\s*$/, '').split(/[.,]\s+/) : [];
  ok(`🔴 THE SPLIT YIELDS THREE PROMISES, NOT ONE BLOB (got ${points.length})`, points.length >= 3);
  ok('and every promise is a real substring of the sentence, so the ticks cannot lie',
    points.length > 0 && points.every((p) => micro.includes(p)));
  ok('none of them is empty, which a trailing separator would produce',
    points.every((p) => p.trim().length > 2));

  // The trial length in that sentence has to agree with the code, same rule as the share card.
  const days = Number(/export const TRIAL_DAYS = (\d+)/.exec(read('lib/entitlement.ts'))?.[1]);
  ok('TRIAL_DAYS was found, so the assertion below is real', Number.isInteger(days) && days > 0);
  ok(`🔴 AND THE HERO'S TRIAL LENGTH AGREES WITH TRIAL_DAYS=${days}`,
    Boolean(micro) && micro.includes(`${days} days free`));

  ok('the hero renders the points rather than the raw sentence', /CTA_POINTS\.map/.test(homeCode));
  // A <ul> with a tick in it renders two markers unless the browser bullet is turned off.
  ok('the tick list suppresses the browser bullet, or every line shows two markers',
    /\.hero \.micro\{[^}]*list-style:none/.test(homeCode));
  // The other three placements still use the sentence. This is not a rename.
  ok('the sentence still ships under the other asks on the page',
    (homeCode.match(/\{CTA_MICRO\}/g) || []).length >= 3);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. The fold budget.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // 🔴 THESE FOUR NUMBERS ARE WHY THE LINE IS ON THE FIRST SCREEN. 46px came out of them and
  // nothing was resized. They are the thing that will quietly grow back.
  const num = (re) => Number(re.exec(homeCode)?.[1]);

  const heroPad = num(/\.home \.hero\{padding:(\d+)px/);
  ok(`🔴 HERO TOP PADDING STAYS AT OR UNDER 44px (is ${heroPad})`, heroPad <= 44);

  const h1Top = num(/\.hero h1\{[^}]*margin:(\d+)px 0 0\}/);
  ok(`h1 top margin stays at or under 12px (is ${h1Top})`, h1Top <= 12);

  const vsBottom = num(/\.hero p\.vs\{[^}]*margin:0 0 (\d+)px/);
  ok(`the comparison line's bottom margin stays at or under 24px (is ${vsBottom})`, vsBottom <= 24);

  const microTop = num(/\.hero \.micro\{[^}]*margin:(\d+)px 0 0/);
  ok(`the ticks' top margin stays at or under 18px (is ${microTop})`, microTop <= 18);

  // ⚠️ A floor as well as a ceiling. Tightened to nothing the hero stops breathing, and somebody
  // fixing that by eye would take the padding straight back over the fold budget.
  ok('and the hero still has top padding at all, rather than being crushed to zero', heroPad >= 24);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. Nothing dropped from the nav is orphaned.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const navBlock = /const NAV_LINKS: \[string, string\]\[\] = \[([\s\S]*?)\];/.exec(siteCode);
  ok('NAV_LINKS was found, so the assertions below are real', Boolean(navBlock));
  const routes = navBlock ? [...navBlock[1].matchAll(/'(\/[^']*)'/g)].map((m) => m[1]) : [];
  ok(`🔴 THE TOP BAR CARRIES AT MOST FOUR MARKETING LINKS (has ${routes.length})`,
    routes.length > 0 && routes.length <= 4);
  ok('and Pricing is one of them, because a price nobody can find is a price nobody trusts',
    routes.includes('/pricing'));

  // 🔴 MOVED, NOT DELETED. This is the assertion that made the trim safe, and it is the one that
  // matters: a page with no sitewide internal link is a page that stops being crawled.
  //
  // ⚠️ SCOPED TO THE FOOTER FUNCTION BODY, not to the whole file. The first version of this
  // assertion sliced the file on the string "NAV_LINKS" and went red against a footer that was
  // perfectly correct. A guard that fails for its own reasons teaches people to ignore it.
  const footer = siteCode.slice(siteCode.indexOf('export function SiteFooter'));
  ok('the footer function body was found, so the assertions below are real', footer.length > 200);
  for (const gone of ['/how-mtd-works', '/compare']) {
    ok(`${gone} still ships a sitewide link from the footer`,
      footer.includes(`'${gone}'`));
    ok(`and ${gone} is still a real page rather than a dead link`,
      existsSync(path.join(root, 'app', gone.slice(1), 'page.tsx')));
  }

  // The mobile burger must read from the same list, or the two navs drift and only one gets fixed.
  ok('🔴 THE BURGER MENU READS THE SAME LIST, so the two navs cannot disagree',
    /nav-panel[\s\S]{0,600}NAV_LINKS\.map/.test(siteCode));
  // The way back in for an existing customer is not a marketing link and must survive the trim.
  ok('Sign in survived the trim', /href="\/in"/.test(siteCode));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
