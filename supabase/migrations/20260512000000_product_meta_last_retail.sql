-- ============================================================================
-- product_meta.last_retail — remember the user's last approved retail price
-- ============================================================================
-- Per-product retail memory keyed by (vendor, item). When the user approves a
-- row in the dashboard approval table, the retail they confirmed is saved here
-- and used as the default Suggested Retail next time the same product appears
-- on an invoice, instead of recomputing fresh from cost × category-markup.
--
-- The user can override the memory for a single invoice via the ↺ button on
-- the row (which doesn't delete this row — it only ignores it for that load).
-- Deleting the memory entirely is a future feature exposed from the vendor
-- drill-down page.
-- ============================================================================

alter table product_meta
  add column if not exists last_retail     numeric(12,4),
  add column if not exists last_retail_at  timestamptz;
