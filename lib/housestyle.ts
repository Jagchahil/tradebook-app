// THE HOUSE STYLE, LOCKED. One rule for every word Lekhio puts in front of anyone: customers, ads,
// DMs, emails, captions, ad copy. No em dash, no en dash, no hyphen used as a sentence dash. The
// generation prompts ASK the model for this; the functions below are the deterministic GUARANTEE,
// run on the output, so a model that ignores the ask still cannot ship a dash. Hyphenated words
// (self-employed) and simple "- " list bullets are preserved untouched.
//
// Every path that emits copy to the outside world routes its final text through houseCopy(). New
// Hoka engines (captions, posts, DMs, ad copy) MUST do the same: this is the business-wide lock.

// The canonical instruction, so every generation prompt can cite ONE source of truth.
export const NO_DASH_RULE =
  'Never use an em dash or an en dash, and never use a hyphen as a sentence dash. Use a full stop or a comma instead. For a number range use the word to, for example £12,570 to £50,270. For subtraction write minus. Keep hyphens only for hyphenated words and simple list bullets.';

// Deterministic sanitiser: removes forbidden dashes without touching hyphenated words or "- " bullets.
export function sanitiseDashes(input: string): string {
  if (!input) return input;
  let s = input;
  s = s.replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2');   // en/em dash between digits: a range -> "to"
  s = s.replace(/(\d) - (\d)/g, '$1 to $2');                    // spaced hyphen between digits: a range -> "to"
  s = s.replace(/\s*[–—]\s*/g, ', ');                 // any remaining em/en dash (sentence dash) -> comma
  s = s.replace(/−/g, '-');                                // minus sign -> plain hyphen (never a sentence dash)
  s = s.replace(/(\S) - (\S)/g, '$1, $2');                      // spaced hyphen as a sentence dash -> comma (bullets are "\n- ", untouched)
  s = s.replace(/ {2,}/g, ' ').replace(/ +,/g, ',');            // tidy the swaps
  return s;
}

// True if any forbidden dash remains. For tests and publish-time guards.
export function hasForbiddenDash(input: string): boolean {
  if (!input) return false;
  if (/[–—−]/.test(input)) return true;
  if (/(\S) - (\S)/.test(input)) return true;
  return false;
}

// The house finisher for any model reply: trim, then strip forbidden dashes. Null passes through, so
// callers keep their "no answer" contract.
export function houseCopy(text: string | null | undefined): string | null {
  if (!text) return null;
  return sanitiseDashes(text.trim());
}
