// 🔴 THE PROOF THAT THE WATCHER WATCHES THE LAW AND NOT THE RESPONSE.
//
//     node khoji/lawsignal.mjs
//
// Fetches every watched source TWICE with the cache busted, extracts the provision signal from
// each, and reports whether the SIGNAL held still while the raw response moved. That is the whole
// claim of the 21 August fix and this is how it is checked, in about a minute, with no database.
//
// WHY IT IS COMMITTED RATHER THAN THROWN AWAY. This bug lived for three weeks in production
// (khoji_runs said 13 to 24 of 24 sources "changed" every night) and nothing could tell anyone
// whether a fix had worked without waiting for 05:15 the next morning. Now it can.
//
// Read it like this:
//   raw VOLATILE + signal stable   the fix is doing exactly its job
//   raw stable   + signal stable   fine, that source was never noisy per request
//   signal BLIND                   we cannot read a provision list. Blind, never 'unchanged'.
//   signal MOVED                   🔴 the provisions differ between two fetches. Investigate.

import { createHash } from 'node:crypto';
import { WATCHED_LEGAL, dataUrlFor, extractSignal } from './lawwatch.mjs';

const h = (t) => (t === null ? null : createHash('sha256').update(t).digest('hex').slice(0, 12));

async function get(url) {
  const bust = url + (url.includes('?') ? '&' : '?') + 'cb=' + Math.random().toString(36).slice(2);
  const res = await fetch(bust, {
    headers: { 'user-agent': 'lekhio-khoji-lawsignal (+https://lekhio.app)', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

let rawMoved = 0, signalMoved = 0, blind = 0, good = 0;

for (const w of WATCHED_LEGAL) {
  const u = dataUrlFor(w.url);
  try {
    const a = await get(u);
    await new Promise((r) => setTimeout(r, 1200));
    const b = await get(u);

    const rawSame = h(a) === h(b);
    const sa = extractSignal(w.url, a);
    const sb = extractSignal(w.url, b);

    if (sa === null || sb === null) {
      blind++;
      console.log('  BLIND     signal unreadable        ' + w.field.padEnd(20) + u);
      continue;
    }
    const sigSame = h(sa) === h(sb);
    if (!rawSame) rawMoved++;
    if (!sigSame) signalMoved++; else good++;

    console.log(
      '  ' + (sigSame ? 'stable  ' : '🔴 MOVED') +
      '  raw ' + (rawSame ? 'stable  ' : 'VOLATILE') +
      '  signal ' + String(sa.split('\n').length).padStart(5) + ' items  ' +
      w.field.padEnd(20) + u,
    );
  } catch (e) {
    blind++;
    console.log('  BLIND     ' + String(e.message).padEnd(24) + w.field.padEnd(20) + u);
  }
}

console.log('');
console.log(good + ' signals held still, ' + signalMoved + ' moved, ' + blind + ' blind.');
console.log(rawMoved + ' of ' + WATCHED_LEGAL.length + ' raw responses moved between two fetches.');
console.log('');
console.log(signalMoved === 0
  ? 'The signal is stable where the response was not. That is the fix working.'
  : '🔴 A signal moved between two fetches. Extraction is still catching something volatile.');
