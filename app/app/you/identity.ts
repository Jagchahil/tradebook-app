// app/app/you/identity.ts. THE PURE RULES OF THE YOU SURFACE, WHERE A TEST CAN ATTACK THEM.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY A MASK FUNCTION EXISTS AT ALL, WHEN THE ADDRESS IS HIS OWN.
//
// The You page prints his email so he can see which inbox his codes go to. It prints it MASKED,
// for the same reason the connect page prints only the last four digits of his number: a page a
// man opens on a building site is a page read over his shoulder, cached by his browser, and
// captured in every screenshot he sends to support. The full address adds nothing he does not
// already know, so only enough of it to be recognised ever reaches the HTML.
//
// ⚠️ AND WHY THE REFUSAL COPY LIVES HERE RATHER THAN IN THE ROUTE.
//
// The one sentence that matters most on this surface is the refusal for an address that belongs
// to another account. The 29 July email takeover fix is law: a contact that is another account's
// is REFUSED, never moved, and the refusal must not reveal whose it is. A sentence assembled in a
// route can quietly grow an interpolation. A sentence in a table of fixed strings cannot carry an
// address, a name or an account into the page, because there is nowhere in it to put one, and
// test/youmail.test.mjs holds it to that shape.
//
// Lives under app/app rather than lib/ because it is the shape of one web surface, not an engine:
// no money, no tax, no I/O. The same reasoning as app/app/entryref.ts. No imports at all, so the
// test can stage this file alone under bare node.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The signed cookie that carries the address between "send me a code" and "here is the code".
// Same discipline as the sign in flow's lek_p, and a DIFFERENT name on purpose: the two flows must
// not be able to read each other's pending contact. The value is minted and verified by
// lib/websession.ts's pendingCookieValue and verifyPendingCookie, so there is one signer, not two.
export const EMAIL_BIND_COOKIE = 'lek_b';

// Enough of the address to be recognised by its owner, and no more. First letter of the local
// part, first letter of the domain, and the ending, so jag@gmail.com reads as j***@g***.com.
// Anything that is not shaped like an address comes back empty, never echoed: a string we could
// not parse is a string we do not print.
export function maskEmail(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  // A domain with no dot, or one that starts or ends on the dot, is not an address we recognise.
  if (dot <= 0 || dot === domain.length - 1) return '';
  const tld = domain.slice(dot + 1);
  return `${local[0]}***@${domain[0]}***.${tld}`;
}

// What the You page says when the email flow comes back with a code in the query string. Fixed
// sentences, chosen by a token, so the page can never be talked into printing something a request
// put there. An unknown token says nothing at all.
//
// ⚠️ THE 'taken' SENTENCE IS THE LAW OF 29 JULY IN COPY FORM. It is honest that the address is
// attached to another account, it says plainly that nothing was moved, and it structurally cannot
// say whose it is, because this function is never handed anything to leak.
export function bindNotice(code: string | null | undefined): string | null {
  switch (code) {
    case 'have':
      return 'There is already an email on this account, so nothing was changed.';
    case 'contact':
      return 'That did not look like an email address. Nothing was sent, so check it and try again.';
    case 'toomany':
      return 'That is a few codes in a short time. Give it a few minutes and try again.';
    case 'capped':
      return 'We have sent all the codes we can for today. It will work again tomorrow.';
    case 'send':
      return 'We could not send the code just then. Nothing has changed, so try again in a minute.';
    case 'taken':
      return 'That address is already attached to a different Lekhio account, so it cannot be added to this one. Nothing has been moved and nothing about either account has changed. If that other account is yours, you can sign in to it with the address itself.';
    case 'expired':
      return 'That took a while, so we stopped holding the address. Start again and the next code will be fresh.';
    case 'code':
      return 'That code did not work. Check the email and type it again.';
    case 'codeexpired':
      return 'That code has expired. Ask for a new one and we will send it straight away.';
    case 'spent':
      return 'That code has been used already. Ask for a new one if you still need it.';
    case 'burnt':
      return 'Too many tries on that code, so we have retired it. Ask for a new one.';
    case 'none':
      return 'We could not find that code. Ask for a new one and try again.';
    case 'unavailable':
      return 'We could not do that just this minute. Nothing has changed, so try again shortly.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    default:
      return null;
  }
}

// Said once the address is on the account. A fact and what it unlocks, nothing else.
export const BOUND_LINE =
  'Your email is on this account now. You can sign in with it from today, and it is where your codes arrive.';

// What the settings page says after a preference is saved. Same fixed sentence discipline.
export function settingsNotice(code: string | null | undefined): string | null {
  switch (code) {
    case 'saved':
      return 'Saved. It takes effect from the next message we would have sent.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so try it again in a minute.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    default:
      return null;
  }
}
