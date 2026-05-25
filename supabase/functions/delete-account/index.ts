// ============================================================================
// Delete Account Edge Function
// ============================================================================
// Permanently deletes the authenticated user's account:
//   1. Cancels their Stripe subscription (if any) via the customer portal.
//   2. Deletes all rows owned by the user (invoices, price_observations, etc.)
//      — Supabase RLS + ON DELETE CASCADE on user_profiles handles most of it.
//   3. Deletes the auth.users row via the service-role admin API, which
//      cascades to user_profiles.
//
// Deploy:
//   supabase functions deploy delete-account --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
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

  // --- Authenticate ---
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

  // --- Load profile to get stripe_customer_id ---
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  // --- Cancel Stripe subscription if one exists ---
  if (profile?.stripe_customer_id) {
    try {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
        apiVersion: "2024-04-10",
      });
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "active",
        limit: 5,
      });
      for (const sub of subs.data) {
        await stripe.subscriptions.cancel(sub.id);
      }
    } catch (_err) {
      // Non-fatal: continue with deletion even if Stripe call fails
    }
  }

  // --- Delete user data explicitly (belt-and-suspenders before auth delete) ---
  // RLS + FK cascades handle most tables; these are explicit for safety.
  for (const table of ["invoices", "price_observations", "product_meta", "ai_usage"]) {
    await supabase.from(table).delete().eq("tenant_id", user.id).throwOnError().then(
      () => {},
      () => {}, // ignore tables that use user_id instead of tenant_id
    );
  }
  await supabase.from("ai_usage").delete().eq("user_id", user.id);

  // --- Delete the auth user (cascades to user_profiles) ---
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteErr) {
    return json({ error: "Failed to delete account", detail: deleteErr.message }, origin, { status: 500 });
  }

  return json({ deleted: true }, origin);
});
