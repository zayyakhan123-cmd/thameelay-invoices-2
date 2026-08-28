-- ASK AI chat persistence — one jsonb row per tenant.
-- Deliberately NOT part of the cloudMark/cloudFlush sync set: the chat has its
-- own debounced save path in the ask module. data = {msgs, proposals, savedAt}.
create table if not exists ask_chat (
  tenant_id  uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table ask_chat enable row level security;

drop policy if exists "tenant_isolation" on ask_chat;
create policy "tenant_isolation" on ask_chat
  for all using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
