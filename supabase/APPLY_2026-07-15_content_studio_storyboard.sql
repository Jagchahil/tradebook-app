-- THE STORYBOARD. Apply AFTER APPLY_2026-07-15_content_studio.sql. Safe to re-run.
--
-- WHY A COLUMN, AND WHY JSON.
--
-- Jag asked to SEE a piece before we make it, scene by scene, because the cheapest thing to change
-- is a storyboard and the most expensive is a finished video. This column is that storyboard: an
-- ordered list of frames, each with what we see, the words on screen, the voiceover, and how long
-- it holds. It is the thing he approves, and approving it is the gate that sits BEFORE a single
-- generation credit is ever spent.
--
-- It is JSON, not its own table, on purpose. A storyboard is never queried across assets, it is
-- only ever read whole, with its one asset. A frames table would buy us joins we will never run and
-- cost us a migration every time a frame grows a field. The shape is small and it belongs to the
-- asset, so it lives on the asset.
--
-- Shape of each frame (the app's Frame type in lib/studio.ts is the source of truth):
--   { "n": 1, "visual": "loft, cable in hand", "caption": "words on screen", "vo": "the line", "seconds": 4 }
--
-- NO CUSTOMER DATA. Same rule as every other table here. A storyboard is our creative, nothing
-- about any person who uses the app.

alter table public.content_assets
  add column if not exists storyboard jsonb not null default '[]'::jsonb;

-- Verify.
select 'content_assets.storyboard' as col,
       count(*) as assets,
       count(*) filter (where jsonb_array_length(storyboard) > 0) as with_frames
from public.content_assets;
