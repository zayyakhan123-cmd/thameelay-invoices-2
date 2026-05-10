-- ============================================================================
-- Thameelay Invoice Manager — Postgres schema
-- ============================================================================
-- Multi-tenant by user_id. Every table has a tenant_id column referencing
-- auth.users(id), with RLS policies enforcing "you can only see your own rows".
--
-- Apply with:  supabase db push   (or paste in Supabase SQL editor)
--
-- Conceptually maps to localStorage keys 1:1:
--   tm_h3              → invoices
--   tm_p3              → price_observations
--   tm_cats            → categories
--   tm_products        → products
--   tm_product_links   → product_links
--   tm_pc_cat          → produce_catalog
--   tm_pc_map          → produce_map
--   tm_pc_rules        → vendor_rules
--   tm_prod_meta       → product_meta
--
-- Extensions
-- ----------
create extension if not exists "uuid-ossp";

-- ============================================================================
-- INVOICES — replaces tm_h3 (loadHist / saveHist)
-- ============================================================================
-- The items array is kept as JSONB so we don't have to flatten every field
-- the client code uses (_u, _rt, etc.). The stable header fields are columns
-- so we can sort and filter on them in SQL.
create table if not exists invoices (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  vendor          text not null,
  invoice_no      text not null,
  date            date,
  doc_type        text default 'invoice',
  customer        text,
  total           numeric(12,2),
  items           jsonb not null default '[]'::jsonb,
  saved_at        timestamptz not null default now(),
  -- Same (vendor, invoice_no) means it's a re-upload; we keep one row per pair per tenant.
  unique (tenant_id, vendor, invoice_no)
);
create index if not exists invoices_tenant_idx     on invoices(tenant_id);
create index if not exists invoices_tenant_vendor  on invoices(tenant_id, vendor);
create index if not exists invoices_tenant_date    on invoices(tenant_id, date desc);

-- ============================================================================
-- PRICE OBSERVATIONS — replaces tm_p3 (loadDB / saveDB)
-- ============================================================================
-- One row per (item, invoice). Flat schema for queryability — rolling up by
-- (tenant_id, vendor, item_no) gives you the price history for a single item.
create table if not exists price_observations (
  id              bigserial primary key,
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  vendor          text not null,
  vendor_key      text not null,         -- normV(vendor): for joins from product_links
  item_no         text,
  description     text,
  norm_desc       text,
  size            text,
  cat             text,
  date            date not null,
  case_cost       numeric(12,4),
  unit_cost       numeric(12,4),
  units           integer,
  invoice_no      text,
  doc_type        text default 'invoice',
  -- Same (vendor_key, item_no, invoice_no) within a tenant is a duplicate observation
  unique (tenant_id, vendor_key, item_no, invoice_no)
);
create index if not exists price_obs_lookup    on price_observations(tenant_id, vendor_key, item_no);
create index if not exists price_obs_date      on price_observations(tenant_id, date desc);

-- ============================================================================
-- CATEGORIES — replaces tm_cats (loadCats / saveCats)
-- ============================================================================
-- Each tenant has their own category set. Built-ins are seeded on first sign-in
-- by the client so we don't hard-code them in the schema.
create table if not exists categories (
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  id              text not null,         -- 'snacks', 'candy', user-coined slugs, etc.
  label           text not null,
  color           text,
  tag             text,                  -- pre-defined CSS class for built-ins; null for custom
  markup          numeric(6,2) not null default 30,
  match_rule      text,
  builtin         boolean not null default false,
  sort_order      integer default 0,
  primary key (tenant_id, id)
);

-- ============================================================================
-- PRODUCTS + PRODUCT LINKS — replaces tm_products / tm_product_links
-- ============================================================================
-- A "product" is your store's SKU. Many vendor lines can map to one product
-- (e.g. bamboo shoots from Dragonfly AND from 999 Foods → one product).
create table if not exists products (
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  id              text not null,         -- 'prod_xxx' from client
  sku             text not null,
  name            text not null,
  created_at      timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, sku)                -- SKUs unique per tenant
);
create index if not exists products_sku on products(tenant_id, sku);

create table if not exists product_links (
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  vendor_key      text not null,         -- normV(vendor)
  item_no         text not null default '',
  product_id      text not null,
  primary key (tenant_id, vendor_key, item_no),
  -- Composite FK so deleting a product removes all links automatically
  foreign key (tenant_id, product_id) references products(tenant_id, id) on delete cascade
);

-- ============================================================================
-- PRODUCE CATALOG — replaces tm_pc_cat
-- ============================================================================
create table if not exists produce_catalog (
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  id              text not null,
  name            text not null,
  unit            text,                  -- 'lb', 'bunch', 'each'
  cost            numeric(12,4),
  image           text,
  aliases         text[],
  data            jsonb,                 -- escape hatch for any other fields
  primary key (tenant_id, id)
);

-- ============================================================================
-- PRODUCE MAP — replaces tm_pc_map (invoice-text → catalog item memory)
-- ============================================================================
create table if not exists produce_map (
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  invoice_text    text not null,
  catalog_id      text,
  remembered_at   timestamptz not null default now(),
  primary key (tenant_id, invoice_text)
);

-- ============================================================================
-- VENDOR RULES — replaces tm_pc_rules (per-vendor shipping fees)
-- ============================================================================
create table if not exists vendor_rules (
  id              bigserial primary key,
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  vendor_key      text not null,
  match           text,
  ship_per_case   numeric(8,2),
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists vendor_rules_lookup on vendor_rules(tenant_id, vendor_key);

-- ============================================================================
-- PRODUCT META — replaces tm_prod_meta (discontinued flags + free-form notes)
-- ============================================================================
create table if not exists product_meta (
  tenant_id       uuid not null references auth.users(id) on delete cascade,
  key             text not null,         -- prodMetaKey(desc, vendor) from client
  discontinued    boolean default false,
  note            text,
  updated_at      timestamptz not null default now(),
  primary key (tenant_id, key)
);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
-- The single rule for every table: a user can only see/modify rows where
-- tenant_id matches their authenticated user id. Without this, ALL rows
-- would be visible to ALL signed-in users — which is exactly the bug
-- you were worried about.
alter table invoices             enable row level security;
alter table price_observations   enable row level security;
alter table categories           enable row level security;
alter table products             enable row level security;
alter table product_links        enable row level security;
alter table produce_catalog      enable row level security;
alter table produce_map          enable row level security;
alter table vendor_rules         enable row level security;
alter table product_meta         enable row level security;

-- One policy per table. Reused name "tenant_isolation" everywhere for grep-ability.
create policy "tenant_isolation" on invoices
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on price_observations
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on categories
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on products
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on product_links
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on produce_catalog
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on produce_map
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on vendor_rules
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "tenant_isolation" on product_meta
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

-- ============================================================================
-- SANITY CHECK — run this AFTER inserting test data to verify isolation works.
-- ============================================================================
-- As user A:  insert into invoices (tenant_id, vendor, invoice_no) values (auth.uid(), 'Test', '001');
-- As user B:  select * from invoices;     -- should return ZERO rows from user A
-- ============================================================================
