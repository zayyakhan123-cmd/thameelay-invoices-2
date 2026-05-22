CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  business_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert waitlist entries"
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Intentionally no SELECT/UPDATE/DELETE policies for anon.
-- Zay reads/manages via Supabase Studio as the project owner.
