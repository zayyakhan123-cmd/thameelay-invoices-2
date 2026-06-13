-- ============================================================================
-- 10-invoice card-required trial (supersedes 20260613000000_free_trial_quota)
-- ============================================================================
-- Product model: the card-on-file free trial grants 10 extractions TOTAL
-- (lifetime, no monthly reset). A new user starts the trial via Stripe Checkout
-- (stripe-checkout trial_period_days) — this sets subscription_status='trialing',
-- a non-free subscription_plan, and a monthly invoice_limit. While trialing the
-- user gets 10 lifetime extractions; on conversion (status='active', via the
-- stripe-end-trial function or the trial elapsing) they get the plan's MONTHLY
-- allotment. A 'free' profile means no subscription/trial (or a cancelled one)
-- and is blocked here.
--
-- This is the server-side enforcement called by the ai edge function so the gate
-- can't be bypassed client-side. The client mirrors it in _invoiceAllowance()
-- in app/index.html.
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
  status      text;
  lim         int;
  cnt         int;
  trial_cap   int  := 10;   -- lifetime extractions during the card-on-file trial
  month_start date := date_trunc('month', current_date)::date;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT subscription_plan, subscription_status, invoice_limit
    INTO plan, status, lim
    FROM user_profiles
    WHERE user_id = uid;

  plan := COALESCE(plan, 'free');

  IF plan = 'free' THEN
    -- No active subscription/trial: extraction requires the card-on-file trial.
    RETURN QUERY SELECT false, 0, 0, NULL::date;
  ELSIF status = 'trialing' THEN
    -- Trial: 10 extractions counted across ALL time (no monthly reset).
    SELECT COUNT(*)::int INTO cnt
      FROM invoices
      WHERE tenant_id = uid;
    RETURN QUERY SELECT (cnt < trial_cap), cnt, trial_cap, NULL::date;
  ELSE
    -- Paid/active plan: plan allotment per calendar month.
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
