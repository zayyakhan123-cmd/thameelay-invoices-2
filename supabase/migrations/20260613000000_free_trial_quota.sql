-- ============================================================================
-- Free tier becomes a ONE-TIME free trial (10 invoices total), not monthly
-- ============================================================================
-- Product model: a new account gets 10 free invoice extractions counted across
-- ALL time (no monthly reset). When those are used up it's upgrade-or-stop.
-- Paid plans keep their plan's allotment per calendar month.
--
-- This replaces check_ai_monthly_quota (server-side enforcement called by the
-- ai edge function) so the trial cap can't be bypassed client-side. The client
-- mirrors this logic in _invoiceAllowance() in app/index.html.
--
-- resets_at is NULL for the free trial (a one-time allotment never resets);
-- for paid plans it's the first of next month, as before.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_ai_monthly_quota()
RETURNS TABLE(allowed boolean, current_count int, monthly_limit int, resets_at date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  plan        text;
  lim         int;
  cnt         int;
  month_start date := date_trunc('month', current_date)::date;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT subscription_plan, invoice_limit INTO plan, lim
    FROM user_profiles
    WHERE user_id = uid;

  plan := COALESCE(plan, 'free');

  IF plan = 'free' THEN
    -- One-time free trial: 10 invoices total, counted across all time.
    lim := 10;
    SELECT COUNT(*)::int INTO cnt
      FROM invoices
      WHERE tenant_id = uid;
    RETURN QUERY SELECT (cnt < lim), cnt, lim, NULL::date;
  ELSE
    -- Paid plan: plan allotment per calendar month.
    lim := COALESCE(lim, 10);
    SELECT COUNT(*)::int INTO cnt
      FROM invoices
      WHERE tenant_id = uid
        AND saved_at >= month_start;
    RETURN QUERY SELECT (cnt < lim), cnt, lim, (month_start + INTERVAL '1 month')::date;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_ai_monthly_quota() FROM public;
GRANT  EXECUTE ON FUNCTION check_ai_monthly_quota() TO authenticated;
