-- Add pack_size, unit_size, reorder_point, target_stock, produce_group to product_meta.
-- These are editable per-product fields set via the vendor drill-down product detail modal.
ALTER TABLE product_meta
  ADD COLUMN IF NOT EXISTS pack_size     int,
  ADD COLUMN IF NOT EXISTS unit_size     text,
  ADD COLUMN IF NOT EXISTS reorder_point int,
  ADD COLUMN IF NOT EXISTS target_stock  int,
  ADD COLUMN IF NOT EXISTS produce_group text;
