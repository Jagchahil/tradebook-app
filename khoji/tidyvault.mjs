// Tidy the Obsidian vault. Khoji filed 143 notes into a man's second brain and most of them were
// rubbish it had already judged to be rubbish.
//
//   node tidyvault.mjs --dry-run   list what would move, touch nothing
//   node tidyvault.mjs             move them
//
// WHAT THIS IS FOR
//
// The vault is not a database. It is a HUMAN's notes. It syncs to Jag's laptop and sits next to
// Business, Daily, Nutrition and Home.md. On 12 July 2026 the Khoji folder held 143 notes and the
// most recent were:
//
//   2026-07-09-preparing-for-vaping-products-duty-and-the-vaping-duty-stamp.md
//   2026-07-09-funded-pension-schemes-vat-notice-700-17.md
//   2026-07-10-currency-codes-for-data-element-4-10-of-the-customs-declarat.md
//   2026-07-10-child-benefit-service-availability-and-issues.md
//
// Every one carrying `affects: "not relevant"` and `confidence: 0.15`, written by Khoji, about
// vaping duty and customs declarations, to a man who does the books for plasterers.
//
// ⚠️ THE GUARD, AND IT IS THE SAME ONE AS EVERYWHERE ELSE IN THIS CODEBASE
//
// The obvious rule is "move anything with low confidence". THE MILEAGE NOTE WOULD HAVE 0.15 ON IT.
// So confidence alone never decides. A note is only moved when it came from one of the two HMRC
// NEWS FEEDS **and** Khoji said outright that it affects nobody **and** it was unsure. A note from a
// watched rates page is never moved, at any confidence, ever. Those are the pages our tax engine
// depends on, and one of them held the number we had wrong for months.
//
// NOTHING IS DELETED. Notes move to <vault>/.trash/, which is Obsidian's own trash convention: the
// app ignores dot folders, so they vanish from the vault but sit on disk until you empty them.
// Acting for a man is only kindness when it is reversible and it is his.

import { readdirSync, readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const VAULT = process.env.OBSIDIAN_VAULT || '';

// The two org-wide HMRC atom feeds. Everything else in sources.json is a watched RATES page and is
// untouchable. If you add a feed to sources.json, add it here, or its junk will pile up unnoticed.
const NEWS_FEEDS = [
  'HMRC news and announcements',
  'HMRC guidance and regulation updates',
];

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return out;
}

// Is this note rubbish that Khoji itself already dismissed? Mirrors triageStatus in distill.mjs.
// If you change one, change the other, or the vault and the database will disagree about what is
// worth keeping, and only one of them is the one a human actually reads.
//
// ⚠️ THE MANUALS GUARD. The first version of this had only the rates-page guard, and the dry run
// against the real vault showed it about to move employment-income-manual.md, cotax-manual.md and
// cwg2-further-guide-to-paye-and-national-insurance-contributions.md into the bin.
//
// Those are HMRC's INTERNAL MANUALS. They are the Phase 3 depth corpus, the moat in doc 104, the
// only thing here a competitor cannot buy off the shelf. The distiller called them "not relevant"
// at under 0.3, because it is a summariser being asked a question about our business it cannot
// answer. It said the same about the mileage page, which held the number our tax engine had wrong.
//
// A manual is never binned. Whatever the model thinks of it.
export function isManual(fm, filename = '') {
  return /hmrc-internal-manuals/i.test(fm.source || '')
      || /\bmanual\b/i.test(filename.replace(/-/g, ' '));
}

export function isBinnable(fm, filename = '') {
  if (!NEWS_FEEDS.includes(fm.source_name)) return false;   // never a watched rates page
  if (isManual(fm, filename)) return false;                 // never a manual. This IS the moat.
  const saysNobody = /not relevant|nobody/i.test(fm.affects || '');
  const conf = Number(fm.confidence);
  const unsure = Number.isFinite(conf) && conf < 0.3;
  return saysNobody && unsure;
}

function main() {
  if (!VAULT) { console.error('[khoji:tidy] OBSIDIAN_VAULT is not set. Nothing to tidy.'); process.exit(1); }
  const dir = path.join(VAULT, 'Khoji');
  if (!existsSync(dir)) { console.error(`[khoji:tidy] no Khoji folder at ${dir}`); process.exit(1); }

  const trash = path.join(VAULT, '.trash', 'khoji-not-relevant');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));

  const bin = [];
  const keep = [];
  const pages = [];
  const manuals = [];
  for (const f of files) {
    const fm = frontmatter(readFileSync(path.join(dir, f), 'utf8'));
    if (!NEWS_FEEDS.includes(fm.source_name)) pages.push(f);
    else if (isManual(fm, f)) manuals.push(f);
    else if (isBinnable(fm, f)) bin.push(f);
    else keep.push(f);
  }

  console.log(`[khoji:tidy] ${files.length} notes in ${dir}`);
  console.log(`[khoji:tidy]   ${bin.length} to move  (news the model itself said affects nobody, at <0.3)`);
  console.log(`[khoji:tidy]   ${keep.length} to keep  (news that could matter)`);
  console.log(`[khoji:tidy]   ${manuals.length} to keep  (HMRC MANUALS. The depth corpus. NEVER moved, whatever the model thinks)`);
  console.log(`[khoji:tidy]   ${pages.length} to keep  (watched rates pages, NEVER moved at any confidence)`);
  if (manuals.length) for (const f of manuals) console.log(`  KEEPING (manual): ${f}`);

  if (DRY) {
    for (const f of bin.slice(0, 15)) console.log(`  would move: ${f}`);
    if (bin.length > 15) console.log(`  ...and ${bin.length - 15} more`);
    console.log('[khoji:tidy] dry run, nothing moved.');
    return;
  }

  mkdirSync(trash, { recursive: true });
  for (const f of bin) renameSync(path.join(dir, f), path.join(trash, f));
  console.log(`[khoji:tidy] moved ${bin.length} to ${trash}`);
  console.log('[khoji:tidy] nothing deleted. Empty that folder yourself when you are happy.');
}

main();
