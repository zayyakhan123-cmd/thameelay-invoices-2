// ============================================================================
// Stripe Billing Portal Edge Function
// ============================================================================
// Creates a Stripe Customer Portal session for the authenticated user and
// returns the URL. If the user has no Stripe customer ID yet, one is created
// and saved back to user_profiles.
//
// Deploy:
//   supabase functions deploy stripe-portal --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_PORTAL_RETURN_URL=https://www.trackaisle.com/app
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const ALLOWED_ORIGINS = [
  "https://trackaisle.com",
  "https://www.trackaisle.com",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const json = (body: unknown, origin: string | null, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, origin, { status: 405 });
  }

  // --- Authenticate via Supabase JWT ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing authorization header" }, origin, { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  );

  if (authErr || !user) {
    return json({ error: "Unauthorized" }, origin, { status: 401 });
  }

  // --- Load user profile ---
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("email, stripe_customer_id, display_name")
    .eq("user_id", user.id)
    .single();

  if (profileErr) {
    return json({ error: "Profile not found" }, origin, { status: 404 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-04-10",
  });

  // --- Get or create Stripe customer ---
  let customerId = profile.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? user.email,
      name: profile.display_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await supabase
      .from("user_profiles")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", user.id);
  }

  // --- Create portal session ---
  const returnUrl =
    Deno.env.get("STRIPE_PORTAL_RETURN_URL") ??
    "https://www.trackaisle.com/app";

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return json({ url: session.url }, origin);
});
