'use client';

import { useEffect } from 'react';

// Runs a page's vanilla JS so it works on CLIENT SIDE NAVIGATION, not just on a
// hard page load.
//
// THE BUG THIS FIXES (found 11 July 2026, live on lekhio.app). The marketing
// pages are server components that shipped their interactivity as an inline
// `<script dangerouslySetInnerHTML>`. On a hard load that script sits in the
// server rendered HTML and the browser parses and runs it, so everything worked
// when you pasted a URL in the address bar. But on a client side navigation (a
// user clicking any in-site link, which is how people actually browse) React
// re-renders the page and inserts that <script> node into the DOM, and per the
// HTML spec a script inserted that way does NOT execute. The result: the slider,
// the tabs, the compare filter, the pricing toggle and the theme toggle were all
// completely dead for anyone browsing the site normally. It only ever worked on a
// refresh, which is exactly why it survived review.
//
// The fix: mount the script from a CLIENT component. useEffect runs on every
// mount, including after a soft navigation, and a <script> created with
// document.createElement and appended DOES execute (unlike one injected as
// markup). The site CSP allows 'unsafe-inline' but NOT 'unsafe-eval', so this
// deliberately appends a real script element rather than using new Function/eval,
// which would be blocked.
//
// The one-time `window.__lek*` guards were removed from the page scripts at the
// same time: they existed to stop double-wiring on a hard load, but they would
// now stop the script re-initialising on the SECOND visit to a page, which is the
// very thing we are fixing.
export default function ClientScript({ js }: { js: string }) {
  useEffect(() => {
    const el = document.createElement('script');
    el.textContent = js;
    document.body.appendChild(el);
    return () => {
      el.remove();
    };
  }, [js]);
  return null;
}
