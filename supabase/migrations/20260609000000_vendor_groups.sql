-- vendor_groups: maps aliases → canonical vendor name per tenant
-- Allows "Gusto", "GUSTO GROUP INC", "FOOD GUSTO" to resolve to one canonical card.
create extension if not exists "uuid-ossp";
create table if not exists vendor_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references auth.users(id) on delete cascade,
  canonical   text not null,
  aliases     jsonb not null default '[]'::jsonb,
  unique (tenant_id, canonical)
);
create index if not exists vendor_groups_tenant_idx on vendor_groups(tenant_id);

alter table vendor_groups enable row level security;
create policy "tenant isolation" on vendor_groups
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());
