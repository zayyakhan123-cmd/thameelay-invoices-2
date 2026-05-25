-- Phase 2: Public signup fields + auto-approval for self-serve billing
--
-- 1. Add first_name, last_name, pending_plan, pending_interval to user_profiles
-- 2. Update handle_new_user() trigger to auto-approve new signups
--    (approval gate was for beta waitlist; billing now controls access)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS first_name       text,
  ADD COLUMN IF NOT EXISTS last_name        text,
  ADD COLUMN IF NOT EXISTS pending_plan     text CHECK (pending_plan     IN ('starter','growth','pro')),
  ADD COLUMN IF NOT EXISTS pending_interval text CHECK (pending_interval IN ('monthly','annual'));

-- Auto-approve new signups so they reach the app (billing enforces plan limits)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.user_profiles(user_id, email, approved, approved_at)
  VALUES (NEW.id, NEW.email, TRUE, NOW())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
