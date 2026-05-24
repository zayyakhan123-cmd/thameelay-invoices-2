-- Migration: Add date to invoices unique constraint
--
-- Before: unique (tenant_id, vendor, invoice_no)
-- After:  unique (tenant_id, vendor, invoice_no, date)
--
-- Why: Gusto order confirmations all carry invoice_no='MI10125' (the customer
-- account number, not an order number). The old 3-column constraint treated
-- them all as the same invoice — each upload overwrote the previous one.
-- Including date lets the same vendor+invoice_no appear on different dates.
--
-- NULL-date behaviour: PostgreSQL unique constraints treat NULL as distinct
-- from every other value, so two null-dated rows with the same vendor+invoice_no
-- are both permitted. This is intentional — we can't deduplicate invoices we
-- can't date. In practice all extracted invoices have a date.

BEGIN;

-- 1. Remove any rows that would violate the new constraint before adding it.
--    Keep the most-recently-saved row per (tenant_id, vendor, invoice_no, date).
DELETE FROM invoices
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, vendor, invoice_no, date
        ORDER BY saved_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM invoices
  ) ranked
  WHERE rn > 1
);

-- 2. Drop the old 3-column constraint.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_tenant_id_vendor_invoice_no_key;

-- 3. Add the new 4-column constraint.
ALTER TABLE invoices
  ADD CONSTRAINT invoices_tenant_vendor_invoice_date_key
  UNIQUE (tenant_id, vendor, invoice_no, date);

COMMIT;
