// PROOF. And the word we are never allowed to use.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WE DO NOT VERIFY. WE CORROBORATE. THE DIFFERENCE IS WHO IS LIABLE.
//
// "Verified" says: we checked this, and we vouch for it. It is a warranty. It is the word an auditor
// uses after doing the work an auditor is insured to do.
//
// What we actually do is look at a photograph. A photograph of a P60 can be somebody else's P60. It
// can be a forgery a fourteen year old made in twenty minutes. It can be last year's, or a duplicate
// of the one he sent in March, or a perfectly genuine document for a perfectly genuine job that has
// nothing to do with the relief he is claiming. NO CRYPTOGRAPHIC VERIFICATION EXISTS FOR ANY OF THE
// DOCUMENTS IN THIS FILE. There is no signature to check. There is nothing to verify AGAINST.
//
// So a green tick that says VERIFIED is a warranty we cannot honour, and he relies on it, and then
// he files. Under Finance Act 2026 Sch 22 an assurance we cannot support is worse than no assurance
// at all, because it is the thing that caused the loss of tax revenue.
//
// What we CAN honestly say is much narrower, and it is still worth a great deal:
//
//     "You told me you were employed until March. The P60 you sent says the same thing."
//
// That is CORROBORATION. Two independent things agree. It is not proof, and we do not pretend it is,
// and it is exactly what a good accountant actually has in his file.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// AND THE SECOND RULE, WHICH IS THE ONE THAT SAVES HIM AN EVENING:
//
// A DOCUMENT WE DO NOT NEED IS A DOCUMENT WE DO NOT ASK FOR.
//
// Half this industry collects paperwork out of habit, because collecting it feels like diligence. It
// is not diligence, it is a liability: every document we hold is a document we must secure, retain
// lawfully, and delete on request. HMRC does not want a marriage certificate for Marriage Allowance.
// It wants two National Insurance numbers. Asking for the certificate would waste his evening, teach
// him that we do not know what we are doing, and leave us holding a document nobody needed.

import { CIRCUMSTANCES, type Circumstance } from './circumstances';

// ---------------------------------------------------------------------------------------------
// THE LADDER. Three rungs, and the top one is NOT "verified".
// ---------------------------------------------------------------------------------------------

export type Standing =
  /** He told us. Nothing has been seen. This is where every circumstance starts, and most stay. */
  | 'asserted'
  /** He sent something, and it AGREES with what he told us. Two independent things now say the same. */
  | 'corroborated'
  /** He sent something and it DISAGREES with what he told us. The most valuable state in this file. */
  | 'conflicts';

// ⚠️ THERE IS DELIBERATELY NO 'verified'. IT IS NOT AN OVERSIGHT AND IT IS NOT A TODO.
//
// If a future hand adds one, it will be because a designer wanted a nicer word for the tick, and the
// tick will then be a warranty this company cannot honour on a document it cannot authenticate.
// test/proof.test.mjs fails the build if the string ever appears in this type.

export const SAYS: Record<Standing, string> = {
  // Note what these say and what they do not. None of them is a claim about the WORLD. Every one is
  // a claim about what we have SEEN, which is the only thing we can actually stand behind.
  asserted: 'You told me this.',
  corroborated: 'You told me this, and the document you sent says the same.',
  conflicts: 'You told me this, but the document you sent says something different. Worth a look.',
};

// ---------------------------------------------------------------------------------------------
// WHAT WE ASK FOR, AND WHAT WE REFUSE TO ASK FOR.
// ---------------------------------------------------------------------------------------------

export interface Ask {
  key: string;
  /** What HMRC would actually want. Often, and importantly, NOTHING. */
  evidence: string;
  /** True when no document is needed AT ALL, so we must not ask for one. */
  nothingNeeded: boolean;
  /** True when the document itself is special-category data (Article 9) and must be deleted after reading. */
  sensitive: boolean;
}

// A document is "not needed" when HMRC does not want one. The evidence strings already say so, in
// plain words, because they were written by reading HMRC's pages rather than by guessing.
export function asks(): Ask[] {
  return CIRCUMSTANCES.map((c: Circumstance) => ({
    key: c.key,
    evidence: c.evidence,
    nothingNeeded: /^nothing\b/i.test(c.evidence.trim()),
    sensitive: c.specialCategory === true,
  }));
}

// 🔴 THE REFUSAL LIST. Documents we will never ask a man for, and why.
//
// Each of these is a thing the industry collects reflexively and HMRC does not want.
export const NEVER_ASK_FOR: Array<{ what: string; why: string }> = [
  {
    what: 'a marriage certificate',
    why: 'HMRC wants two National Insurance numbers for Marriage Allowance. It has never wanted a certificate. Asking for one wastes his evening, tells him we do not know the rules, and leaves us holding a document nobody needed.',
  },
  {
    what: 'a birth certificate for his children',
    why: 'Child Benefit and the National Insurance credit that comes with it run off the CH2 form. The certificate is not part of our business.',
  },
  {
    what: 'his bank login',
    why: 'The bank feed is consented through the bank\'s own screens (TrueLayer, FCA authorised) and is READ ONLY. We never see a credential, and we never ask for one.',
  },
];

// ---------------------------------------------------------------------------------------------
// CORROBORATION. Does the document agree with what he told us?
// ---------------------------------------------------------------------------------------------

export interface Corroboration {
  standing: Standing;
  says: string;
  /** What we actually compared. Named, so he can see the reasoning and disagree with it. */
  basis: string;
  /** True when the document must be deleted once read. Health data is not a filing cabinet. */
  deleteAfterReading: boolean;
}

export function corroborate(
  key: string,
  toldUs: string,
  documentSays: string | null,
): Corroboration {
  const c = CIRCUMSTANCES.find((x) => x.key === key);
  const sensitive = c?.specialCategory === true;

  // NOTHING SEEN. He told us, and that is all, and we SAY that is all.
  //
  // ⚠️ AND AN ASSERTION IS NOT A LESSER THING. Most reliefs in this product need no document at all,
  // and for those, "you told me" IS the complete and correct evidential position. A product that
  // treats an unproven assertion as a failure state will start asking for paperwork to fill the gap,
  // and the paperwork will be paperwork nobody wanted.
  if (!documentSays) {
    return {
      standing: 'asserted',
      says: SAYS.asserted,
      basis: 'Nothing has been sent, and for most of these nothing is needed.',
      deleteAfterReading: false,
    };
  }

  const agrees = normalise(documentSays) === normalise(toldUs);

  return {
    standing: agrees ? 'corroborated' : 'conflicts',
    says: agrees ? SAYS.corroborated : SAYS.conflicts,

    // 🔴 WE NAME WHAT WE COMPARED. A tick with no reasoning behind it is a tick he cannot argue with,
    // and he is the one who signs the return. If our reading of his P60 is wrong, he must be able to
    // see THAT it is wrong, not just that we disagreed with him.
    basis: `You said "${toldUs}". The document reads "${documentSays}".`,

    // Health data is read and DROPPED. It is not filed, not retained, not kept "in case". Article 9,
    // and the circumstances chain already refuses to carry it over WhatsApp in either direction.
    deleteAfterReading: sensitive,
  };
}

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------------------------
// THE GREEN TICK. What it is allowed to say.
// ---------------------------------------------------------------------------------------------
//
// Jag's line was "proven within 30 days with AI-checked documents and a green tick". The tick is
// right. The word "proven" is not, and neither is "verified", and the difference is not pedantry:
// it is the difference between describing what we saw and warranting what is true.
export function tick(standing: Standing): { mark: string; label: string } {
  switch (standing) {
    case 'corroborated':
      // A tick, and a word he can hold us to. We are not claiming the P60 is genuine. We are claiming
      // it says what he said, which is a fact about our own reading and nothing more.
      return { mark: '✓', label: 'Matches what you told me' };
    case 'conflicts':
      // NOT a red cross. He is not in trouble and he has not been caught at anything. Most conflicts
      // are a photo of the wrong year. A product that accuses him will get no more photographs.
      return { mark: '!', label: 'Does not match. Worth a look.' };
    default:
      return { mark: '·', label: 'You told me this' };
  }
}
