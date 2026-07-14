-- THE APPROVAL GATE GETS A HANDLE.
--
-- Until today the console said "39 waiting for a human" and there was NO WAY FOR A HUMAN TO DO
-- ANYTHING ABOUT IT. The gate existed in the schema (knowledge_items.status), the rule was real
-- (nothing but a `reviewed` row ever reaches a user's tax answer), and the door had no handle.
--
-- An approval gate with no approve button is not a safeguard. It is a bottleneck we built and then
-- forgot to open. Doc 104: one less button at a time, until only one is left. THIS is that one.
--
-- These two columns are the reason the click is worth anything. Approving is the moment a sentence
-- about tax law becomes something we will say to a man who is about to sign his return. When
-- somebody later asks why we told six thousand people that, the answer has to be A NAME AND A DATE.
-- Not "the system decided".

alter table public.knowledge_items
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

-- The queue is read by status every time the console loads. Index it.
create index if not exists knowledge_items_status_idx
  on public.knowledge_items (status, created_at desc);

comment on column public.knowledge_items.reviewed_by is
  'The team member who approved or dismissed this item. A reviewed row is the only kind that ever reaches a user, so this is an accountability record, not metadata.';

notify pgrst, 'reload schema';
