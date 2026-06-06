-- ============================================================================
-- Replace per-day AI cap with per-month quota tied to the user's plan
-- ============================================================================
-- The old check_and_increment_ai_usage / ai_usage table used a hardcoded
-- DAILY_LIMIT = 10 that ignored subscription plans entirely.
--
-- This function reads invoice_limit from user_profiles (set by the Stripe
-- webhook on subscription events) and counts actual invoices saved this
-- calendar month from the invoices table — the same source the client counts.
--
-- Returns: allowed, current_count, monthly_limit, resets_at
--   allowed=true  → under quota, proceed with extraction
--   allowed=false → at or over quota, reject with 429
--
-- The old ai_usage table is left in place (historical data, no longer written).
-- ============================================================================

CREATE OR REPLACE FUNCTION check_ai_monthly_quota()
RETURNS TABLE(allowed boolean, current_count int, monthly_limit int, resets_at date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  lim         int;
  cnt         int;
  month_start date := date_trunc('month', current_date)::date;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT invoice_limit INTO lim
    FROM user_profiles
    WHERE user_id = uid;

  lim := COALESCE(lim, 10);

  SELECT COUNT(*)::int INTO cnt
    FROM invoices
    WHERE tenant_id = uid
      AND saved_at >= month_start;

  RETURN QUERY SELECT
    cnt < lim,
    cnt,
    lim,
    (month_start + INTERVAL '1 month')::date;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_ai_monthly_quota() FROM public;
GRANT  EXECUTE ON FUNCTION check_ai_monthly_quota() TO authenticated;
