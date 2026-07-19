'use client';

// THE STUDIO IS RETIRED. The content studio was a separate web portal, and that was the wrong frame:
// marketing is what an employee DOES, not a page you visit. Its job (drafting, approval, the scoreboard,
// and the founder-led sales-ideas bank) moves into the marketing bot. So this route no longer shows a
// studio; it sends you back to the console. The dormant studio backend is deleted when the marketing
// bot is built.

import { useEffect } from 'react';

export default function StudioRetired() {
  useEffect(() => {
    window.location.replace('/team');
  }, []);
  return null;
}
