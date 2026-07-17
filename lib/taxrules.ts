// Allowable expenses knowledge base — now a thin re-export of the ONE canonical corpus.
//
// The rules used to live here as a hand-typed array, and a second hand-typed array lived in the
// mobile app. They drifted, and the drift shipped wrong answers to the phone. So the data moved to
// lib/claimrules.data.ts, which is byte-identical in both repos and guarded by
// test/taxrules-parity.test.mjs. Everything that used to import from './taxrules' still works, because
// every symbol is re-exported here unchanged.
//
// Edit the corpus in lib/claimrules.data.ts, then `node scripts/sync-corpus.mjs` to copy it to the app.

export * from './claimrules.data';
export type { Verdict, ExpenseRule } from './claimrules.data';
