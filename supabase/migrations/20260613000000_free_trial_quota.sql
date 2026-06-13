-- ============================================================================
-- Card-required free trial: 'free' (no subscription) is blocked from extraction
-- ============================================================================
-- Product model: there is no free-to-extract tier. A new user starts a 14-day
-- card-on-file trial via Stripe Checkout (stripe-checkout trial_period_days),
-- which sets a non-free subscription_plan + invoice_limit — so trialing and
-- paid users both get their plan's MONTHLY allotment. A 'free' profile means
-- no active subscription/trial (or a cancelled one) and is blocked here.
--
-- This is the server-side enforcement called by the ai edge function so the
-- gate can't be bypassed client-side. The client mirrors it in
-- _invoiceAllowance() in app/index.html.
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
    -- No active subscription/trial: extraction requires the card-on-file free
    -- trial (a trialing/paid subscription sets a non-free plan + invoice_limit).
    RETURN QUERY SELECT false, 0, 0, NULL::date;
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
