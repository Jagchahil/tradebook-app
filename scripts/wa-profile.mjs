// THE WHATSAPP BUSINESS PROFILE. The card a customer sees when he taps our name in the thread.
//
//   node scripts/wa-profile.mjs            read what is live now
//   node scripts/wa-profile.mjs --write    write the profile below
//   node scripts/wa-profile.mjs --photo ./public/lekhio-icon-1024.png
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY A SCRIPT RATHER THAN CLICKING THROUGH META.
//
// Two reasons and the second is the one that matters.
//
//   1. WhatsApp Manager's profile screen is several layers of JavaScript with no stable handles,
//      and a profile edited by hand is a profile nobody can diff, review or put back.
//   2. 🔴 THE TOKEN NEVER LEAVES THIS MACHINE. WHATSAPP_TOKEN is a server secret. It is read from
//      the environment here, on Jag's Mac, and it is never pasted into a chat, a browser field or
//      a log. The one place a token gets leaked is the place somebody handles it manually.
//
// ⚠️ NOTHING IS WRITTEN WITHOUT --write. Run it bare first and read what is actually live; the
// profile has been wrong for long enough that guessing at it would just be a second guess.
//
// ⚠️ AND THE PHOTO IS A SEPARATE, THREE STEP UPLOAD. Meta's resumable upload API wants a session
// first, then the bytes, then the handle attached to the profile. It is done here so the icon can
// never drift from the one in public/, which is the whole complaint: the logo on WhatsApp is the
// old one and nothing anywhere made the two agree.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const APP_ID = process.env.META_APP_ID; // only needed for --photo

if (!TOKEN || !PHONE_NUMBER_ID) {
  console.error('\n  Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID in the environment.');
  console.error('  Pull them from Vercel with:  vercel env pull .env.local');
  console.error('  Then:  set -a && . ./.env.local && set +a && node scripts/wa-profile.mjs\n');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE PROFILE. This is the copy, and it is the only place it should ever be written.
//
// It follows the one rule the whole brand now turns on: WE SELL THE EMPLOYEE AND THE MONEY IT
// FINDS. Not bookkeeping, which is free from six providers. Not Making Tax Digital, which is a
// list of 106 recognised products and a category we would lose. The homepage already says
// "Your first employee. The one that saves you money." This says the same thing in the one place
// a customer looks when he is deciding whether the number that just messaged him is real.
//
// ⚠️ 'about' IS 139 CHARACTERS MAX and it is the line under the name. 'description' is 512 and it
// is the paragraph. Meta silently truncates rather than refusing, so both are checked below.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const PROFILE = {
  about: 'Your first employee. The one that saves you money.',
  description:
    'Lekhio is the first employee for a UK business. Send a photo of a receipt, a voice note, or '
    + 'just say what came in, and it keeps your books, works out your tax and finds the money you '
    + 'are owed. You approve everything. Nothing reaches HMRC without your yes.',
  email: 'hello@lekhio.app',
  websites: ['https://lekhio.app'],
  vertical: 'PROFESSIONAL_SERVICES',
  address: '',
};

const LIMITS = { about: 139, description: 512 };

const q = (extra = {}) => new URLSearchParams({ access_token: TOKEN, ...extra }).toString();

async function readProfile() {
  const fields = 'about,address,description,email,profile_picture_url,websites,vertical';
  const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/whatsapp_business_profile?${q({ fields })}`);
  const body = await res.text();
  if (!res.ok) throw new Error(`read failed ${res.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

async function writeProfile(patch) {
  const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/whatsapp_business_profile?${q()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...patch }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`write failed ${res.status}: ${body.slice(0, 600)}`);
  return JSON.parse(body);
}

// Meta's resumable upload: create a session, push the bytes, get a handle back.
async function uploadPhoto(file) {
  if (!APP_ID) throw new Error('META_APP_ID is needed for --photo (the Meta app id, not a secret).');
  const bytes = readFileSync(file);
  const size = statSync(file).size;
  const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const s = await fetch(
    `${GRAPH}/${APP_ID}/uploads?${q({ file_name: path.basename(file), file_length: String(size), file_type: type })}`,
    { method: 'POST' },
  );
  const sBody = await s.text();
  if (!s.ok) throw new Error(`upload session failed ${s.status}: ${sBody.slice(0, 400)}`);
  const sessionId = JSON.parse(sBody).id;

  const u = await fetch(`${GRAPH}/${sessionId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0', 'Content-Type': type },
    body: bytes,
  });
  const uBody = await u.text();
  if (!u.ok) throw new Error(`upload failed ${u.status}: ${uBody.slice(0, 400)}`);
  return JSON.parse(uBody).h;
}

const args = process.argv.slice(2);
const photoAt = args.indexOf('--photo');
const photo = photoAt >= 0 ? args[photoAt + 1] : null;

try {
  console.log('\n  BEFORE, live right now:\n');
  const before = await readProfile();
  console.log(JSON.stringify(before.data?.[0] ?? before, null, 2));

  if (!args.includes('--write') && !photo) {
    console.log('\n  Nothing written. Re-run with --write to apply the profile in this file.\n');
    process.exit(0);
  }

  // ⚠️ CHECKED BEFORE SENDING, because Meta truncates silently and a half sentence about a man's
  // money is worse than no sentence.
  for (const [k, max] of Object.entries(LIMITS)) {
    if (PROFILE[k] && PROFILE[k].length > max) {
      throw new Error(`${k} is ${PROFILE[k].length} chars, over Meta's ${max}. Shorten it in this file.`);
    }
  }

  const patch = args.includes('--write') ? { ...PROFILE } : {};
  if (photo) {
    console.log(`\n  Uploading ${photo} ...`);
    patch.profile_picture_handle = await uploadPhoto(photo);
    console.log('  Uploaded.');
  }

  await writeProfile(patch);
  console.log('\n  AFTER:\n');
  console.log(JSON.stringify((await readProfile()).data?.[0] ?? {}, null, 2));
  console.log('\n  Done. Open the thread on your phone and tap the name to see it as a customer does.\n');
} catch (err) {
  console.error(`\n  ${err instanceof Error ? err.message : 'unknown error'}\n`);
  process.exit(1);
}
