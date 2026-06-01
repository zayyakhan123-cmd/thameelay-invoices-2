-- Produce Matcher invoice history — persists pcLoadHist() across devices.
-- Previously stored only in localStorage (tm_pc_hist), so history was lost
-- when the user signed in on a different browser. This table syncs it.
--
-- One row per produce invoice per tenant. The full matched-lines array is
-- stored as JSONB so the schema stays flexible without extra columns.

create table if not exists produce_hist (
  tenant_id   uuid        not null references auth.users(id) on delete cascade,
  vendor      text        not null,
  invoice_no  text        not null,
  inv_date    text,
  saved_at    timestamptz not null default now(),
  lines       jsonb,
  primary key (tenant_id, vendor, invoice_no)
);

alter table produce_hist enable row level security;

create policy tenant_isolation on produce_hist
  using  (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());
