// ONE MARK, AND NOTHING THAT CLAIMS A TRIAL WE DO NOT GIVE.
//
//   node test/brandmark.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT WAS ACTUALLY TRUE ON THE MORNING OF 10 AUGUST 2026.
//
// The nav's stylesheet carried a comment reading "the same gradient mark the app uses, one logo
// everywhere". There were THREE marks in this repo and no two of them matched:
//
//   app/icon.png, app/apple-icon.png   dark navy, square corners, a river under the L
//   public/lekhio-icon-1024.png        brighter blue, rounder, no river
//   .logo-chip in site.tsx             a third gradient, built out of CSS
//
// The reason is worth keeping. THE HEADER MARK WAS A CSS RECIPE, and a CSS recipe cannot be
// uploaded to Instagram, printed, or attached to anything. So every other surface needed a PNG,
// each PNG was made separately by hand, and nothing anywhere could compare them. The Instagram
// avatar was set from the middle one and was simply the wrong logo.
//
// ⚠️ AND THE TWO STOP GRADIENT WAS A DEFECT RATHER THAN A STYLE. Blue to amber, corner to corner,
// averages to olive across the middle. It survives at 34px because that band is three pixels wide.
// At avatar size it is a third of the picture. public/lekhio-logo.svg, the wordmark, had already
// solved this years of commits earlier with a three stop gradient through #2E7BBF. Nobody carried
// the fix across, because nothing connected the two files.
//
// 🔴 AND THE SHARE CARD WAS WORSE THAN A WRONG LOGO. app/opengraph-image.png, the picture every
// WhatsApp, LinkedIn and Facebook link renders, read "30 days free". lib/entitlement.ts says
// TRIAL_DAYS = 7. We were advertising a month and giving a week, on every link anybody shared,
// and the only reason it survived is that a PNG is not a thing anybody re-reads.
//
// So this suite pins four things:
//   1. The mark is a FILE, and the site loads that file rather than rebuilding it from CSS.
//   2. The file is the shape and gradient we chose, with the L as a PATH, not live text.
//   3. No second logo may appear in public/ or app/ without this failing.
//   4. 🔴 NO TRIAL LENGTH ANYWHERE IN CODE MAY DISAGREE WITH TRIAL_DAYS.
//
// ⚠️ WHAT THIS DOES NOT PROVE, SO THE NEXT READER CAN TELL A DECISION FROM A HOLE. It does not
// compare the PNG PIXELS against the SVG: that needs a browser, and a test that boots Chromium to
// check a logo would be the slowest thing in this suite by an order of magnitude. It proves the
// PNGs are the right sizes, have the squircle's transparent corners, and that only one source file
// exists for anybody to render from. The pixels are checked by eye at the moment they are made.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// PNG width and height live at bytes 16..24 of the IHDR chunk. Cheaper than a decoder and it is
// all we need: the question is "was this rendered at the size it claims", not "what colour is it".
function pngSize(rel) {
  const b = readFileSync(path.join(root, rel));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. The mark is a file, and the site loads that file.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const MARK = 'public/lekhio-mark.svg';
  ok('🔴 THE ONE MARK EXISTS AS A FILE', existsSync(path.join(root, MARK)));

  const site = read('app/_shared/site.tsx');
  const code = codeOnly(site);
  ok('🔴 THE HEADER LOADS IT, rather than rebuilding the mark out of CSS',
    /src="\/lekhio-mark\.svg"/.test(code));
  // The exact thing that made three logos possible. A gradient recipe in the chip means the header
  // is a mark nothing else can ever use, so every other surface gets a hand made copy.
  ok('🔴 AND .logo-chip NO LONGER CARRIES A GRADIENT RECIPE',
    !/\.logo-chip\{[^}]*linear-gradient/.test(code));
  ok('and it no longer holds a letter of its own that could drift from the file',
    !/<span className="logo-chip">/.test(code));
  // box-shadow would draw the old rectangle's shadow around a shape that is not a rectangle.
  ok('the shadow follows the shape (drop-shadow, not box-shadow)',
    /\.logo-chip\{[^}]*drop-shadow/.test(code) && !/\.logo-chip\{[^}]*box-shadow/.test(code));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. The file is the mark we chose.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const svg = read('public/lekhio-mark.svg');
  const RIVER = '#1B59A6';
  const MID = '#2E7BBF';
  const SAFFRON = '#E0A33E';

  ok('🔴 THREE STOPS, NOT TWO: this is the whole fix for the olive band',
    (svg.match(/<stop /g) || []).length === 3);
  ok('and the stops are the brand colours, the same three the wordmark uses',
    svg.includes(RIVER) && svg.includes(MID) && svg.includes(SAFFRON));
  // Every colour here also has to exist in lib/tokens.ts, or the mark is quietly its own palette.
  const tokens = read('lib/tokens.ts');
  ok('🔴 AND BOTH ENDPOINTS COME FROM lib/tokens.ts, so the mark cannot invent a colour',
    tokens.includes(RIVER) && tokens.includes(SAFFRON));

  // 🔴 THE L IS AN OUTLINE, NOT TEXT. A <text> element renders in whatever font the viewer has,
  // so the same file would draw a different letter on a machine without Inter, and an SVG logo
  // that reflows is not a logo.
  ok('🔴 THE L IS A VECTOR PATH, so it cannot reflow when Inter fails to load',
    !/<text/.test(svg) && (svg.match(/<path /g) || []).length >= 2);
  // 🔴 THE RULE IS SAFFRON AND IT SITS LEFT OF CENTRE, and that is not decoration. It is the only
  // warm element in the mark, so it only reads at all against the blue half of the gradient. Slide
  // it right and it lands on the amber end and vanishes.
  const rule = /<rect[^>]*x="([\d.]+)"[^>]*width="([\d.]+)"[^>]*fill="#E0A33E"/.exec(svg)
            || /<rect[^>]*fill="#E0A33E"[^>]*/.exec(svg);
  ok('🔴 THE SAFFRON RULE IS THERE', /<rect[^>]*fill="#E0A33E"/.test(svg));
  ok('and it is a straight rule, not the old wavy river', !/[Cc]\s*[\d.-]+[, ]/.test(svg.split('<rect')[1] ?? ''));
  if (rule && rule[1] && rule[2]) {
    const centre = Number(rule[1]) + Number(rule[2]) / 2;
    ok('🔴 AND ITS CENTRE STAYS LEFT OF THE AMBER END, or it disappears into the gradient',
      centre <= 1024 * 0.56);
  } else {
    ok('the rule geometry was readable, so the position check above is real', false);
  }
  ok('the mark is square, so every avatar crop treats it the same', /viewBox="0 0 1024 1024"/.test(svg));
  ok('and it carries its own label for anything that renders it alone', /aria-label="Lekhio"/.test(svg));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. Nothing else in the repo is a logo.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const sizes = {
    'public/lekhio-icon-1024.png': 1024,
    'app/icon.png': 512,
    'app/apple-icon.png': 180,
  };
  for (const [rel, side] of Object.entries(sizes)) {
    const { w, h } = pngSize(rel);
    ok(`${rel} is ${side}x${side}`, w === side && h === side);
  }
  const og = pngSize('app/opengraph-image.png');
  ok('the share card is 1200x630, the size every platform crops from', og.w === 1200 && og.h === 630);

  // 🔴 THE SWEEP. Any image dropped into public/ or app/ that is not on this list is either a new
  // logo nobody told anyone about, or scaffolding that was never removed. Both were true this
  // morning: next.svg, vercel.svg, window.svg, globe.svg and file.svg were Next's and Vercel's own
  // marks, sitting in our public folder since the day the project was created.
  const allowed = new Set([
    'lekhio-mark.svg',     // the mark
    'lekhio-logo.svg',     // the WORDMARK. A different job, deliberately a different drawing.
    'lekhio-icon-1024.png',
    'icon.png', 'apple-icon.png', 'opengraph-image.png',
  ]);
  const strays = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      // Quarantined on purpose. The folder name is the record of the decision.
      if (e.name === '_to_delete') continue;
      const r = path.join(rel, e.name);
      if (e.isDirectory()) { walk(path.join(dir, e.name), r); continue; }
      if (!/\.(png|svg|jpg|jpeg|webp|ico|icns)$/i.test(e.name)) continue;
      if (!allowed.has(e.name)) strays.push(r);
    }
  };
  walk('public', 'public');
  walk('app', 'app');
  ok(`🔴 NO SECOND LOGO ANYWHERE IN public/ OR app/${strays.length ? ` (${strays.join(', ')})` : ''}`,
    strays.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. Nothing claims a trial we do not give.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // 🔴 THE OPENGRAPH CARD SAID "30 days free" AND TRIAL_DAYS IS 7.
  //
  // It was a picture, so no test could read it and no person re-reads a PNG. This cannot guard the
  // pixels, but it can guard every place the claim is written as text, which is where it will be
  // written next time. A number that disagrees with lib/entitlement.ts is now a build failure.
  const days = Number(/export const TRIAL_DAYS = (\d+)/.exec(read('lib/entitlement.ts'))?.[1]);
  ok('TRIAL_DAYS was found, so the assertion below is real', Number.isInteger(days) && days > 0);

  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_to_delete') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      // ⚠️ CODE ONLY. lib/supabase.ts carries "We were advertising fourteen days free, and the
      // fourteen days did not exist" as the record of an incident already fixed. A guard that
      // failed on a comment describing history would push people to delete the history.
      const src = codeOnly(readFileSync(path.join(root, full), 'utf8'));
      for (const m of src.matchAll(/(\d+)\s+days free/g)) {
        if (Number(m[1]) !== days) offenders.push(`${path.relative(root, full)}: "${m[0]}"`);
      }
    }
  };
  walk('app'); walk('lib');
  ok(`🔴 EVERY TRIAL LENGTH IN CODE AGREES WITH TRIAL_DAYS=${days}${offenders.length ? ` (${offenders.join('; ')})` : ''}`,
    offenders.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
