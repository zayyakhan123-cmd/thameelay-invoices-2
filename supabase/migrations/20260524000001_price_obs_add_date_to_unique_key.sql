-- Migration: Add date to price_observations unique constraint
--
-- Before: unique (tenant_id, vendor_key, item_no, invoice_no)
-- After:  unique (tenant_id, vendor_key, item_no, invoice_no, date)
--
-- Why: Same as invoices migration — Gusto order confirmations all share
-- invoice_no='MI10125'. Without date in the constraint, observations for
-- the same item across 16 different order dates would all conflict, causing
-- the full price_observations cloud sync (which does DELETE + INSERT) to
-- fail silently and lose all Gusto price history from Supabase.
--
-- The app's cloudReplacePriceObs() already does full wipe+reinsert, so no
-- on_conflict change is needed in the app — just the schema constraint.

BEGIN;

-- 1. Remove any rows that would violate the new constraint.
DELETE FROM price_observations
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, vendor_key, item_no, invoice_no, date
        ORDER BY id DESC
      ) AS rn
    FROM price_observations
  ) ranked
  WHERE rn > 1
);

-- 2. Drop the old constraint.
ALTER TABLE price_observations
  DROP CONSTRAINT IF EXISTS price_observations_tenant_id_vendor_key_item_no_invoice_no_key;

-- 3. Add new constraint with date included.
ALTER TABLE price_observations
  ADD CONSTRAINT price_obs_tenant_vendor_item_invoice_date_key
  UNIQUE (tenant_id, vendor_key, item_no, invoice_no, date);

COMMIT;
