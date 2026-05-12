-- ============================================================================
-- Rename product_meta.sold_by 'package' → 'each'
-- ============================================================================
-- The earlier rollout used 'package' as the internal name for "sold as
-- individual consumer packages" (OZ/PCS/CT/EA defaults). The follow-up spec
-- renames this to 'each' to match how retailers actually phrase it ("price
-- per each"). Math is identical (case_cost / inner_count) so this is a pure
-- label rename — no user-visible change in cost, just in the dropdown wording.
-- ============================================================================

update product_meta set sold_by = 'each' where sold_by = 'package';
