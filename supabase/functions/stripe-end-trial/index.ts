// ============================================================================
// Stripe End-Trial Edge Function
// ============================================================================
// Ends the authenticated user's card-on-file trial immediately: charges the
// card now and flips the subscription to active. Called from the in-app upgrade
// modal when a trialing user has spent their 10 free extractions and chooses to
// continue. The resulting customer.subscription.updated event is handled by
// stripe-webhook, which sets subscription_status='active' + the monthly limit.
//
// Deploy:
//   supabase functions deploy stripe-end-trial --no-verify-jwt
//   (uses the same STRIPE_SECRET_KEY secret as stripe-checkout)
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

  // --- Load the user's Stripe customer ---
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (profileErr || !profile?.stripe_customer_id) {
    return json({ error: "No billing account found" }, origin, { status: 404 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-04-10",
  });

  // --- Find the trialing subscription and end the trial now (charges the card) ---
  const subs = await stripe.subscriptions.list({
    customer: profile.stripe_customer_id,
    status: "trialing",
    limit: 1,
  });

  const sub = subs.data[0];
  if (!sub) {
    return json({ error: "No active trial to convert" }, origin, { status: 409 });
  }

  // trial_end:'now' immediately ends the trial and invoices the first period.
  // proration_behavior:'none' avoids a prorated partial-period charge.
  await stripe.subscriptions.update(sub.id, {
    trial_end: "now",
    proration_behavior: "none",
  });

  return json({ ok: true }, origin);
});
