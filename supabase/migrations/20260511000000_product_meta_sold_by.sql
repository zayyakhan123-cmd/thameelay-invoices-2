-- ============================================================================
-- product_meta.sold_by — per-product unit-of-sale override
-- ============================================================================
-- Lets a user pin how an item is sold ('box', 'lb', 'kg', 'package') so the
-- unit-cost calc divides by the right number for bulk-weight items like
-- "1X33#" (sold by the pound, not by the single box).
--
-- NULL = no override; the client falls back to its size-string inference.
-- ============================================================================

alter table product_meta
  add column if not exists sold_by text;
