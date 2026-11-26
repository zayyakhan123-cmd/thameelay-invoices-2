-- product_meta.upc / product_meta.sku — codes the owner types on the item page.
-- upc: the barcode printed on the package (digits only, validated client-side).
-- sku: the store's own register / POS code for the item.
-- Both nullable and additive; no existing rows or policies change.
ALTER TABLE product_meta
  ADD COLUMN IF NOT EXISTS upc text,
  ADD COLUMN IF NOT EXISTS sku text;
