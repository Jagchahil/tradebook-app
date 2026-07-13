'use client';

import { createClient } from '@supabase/supabase-js';

// The BROWSER Supabase client. Anon key only.
//
// ⚠️ NEVER import lib/supabase.ts from a client component. That file holds the service role key,
// which bypasses row level security entirely, and shipping it to a browser would hand every visitor
// the keys to every tradesman's books. The two files are separate so that mistake has to be made on
// purpose rather than by autocomplete.
//
// This client is used for exactly one thing: signing a team member in with an emailed magic link,
// and holding the session token afterwards. Every privileged read still happens on the server, in
// /api/team/overview, which checks team_members on every request.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const browserSupabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
