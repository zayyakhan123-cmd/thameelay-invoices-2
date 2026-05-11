// ============================================================================
// AI Proxy Edge Function
// ============================================================================
// Proxies Anthropic API calls so the user's API key lives on the server, not in
// the browser. The client sends the same body shape it would send to Anthropic
// directly; this function authenticates the caller via their Supabase JWT,
// then forwards the request with the server-side ANTHROPIC_API_KEY.
//
// Deploy with:
//   supabase functions deploy ai --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Why --no-verify-jwt: we authenticate manually below so we can return a useful
// error message instead of the generic 401 the platform returns.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS: allow the deployed app to call us. Tighten the origin in production
// if you want to restrict to one domain.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) },
  });

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  // Server-side configuration
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !anonKey || !apiKey) {
    return json(
      { error: "Server misconfigured: missing SUPABASE_URL, SUPABASE_ANON_KEY, or ANTHROPIC_API_KEY" },
      { status: 500 },
    );
  }

  // Authenticate the caller via their Supabase JWT.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return json({ error: "Invalid session" }, { status: 401 });
  }

  // Exemption — comma-separated list of UUIDs in EXEMPT_USER_IDS skip the
  // approval gate and the daily cap entirely. Used so the admin can test
  // and burn invoices without locking themselves out.
  const exemptRaw = Deno.env.get("EXEMPT_USER_IDS") || "";
  const exemptSet = new Set(
    exemptRaw.split(",").map((s) => s.trim()).filter(Boolean),
  );
  const isExempt = exemptSet.has(userData.user.id);

  if (!isExempt) {
    // Approval gate — every new account starts unapproved; an admin flips
    // user_profiles.approved=true in Supabase Studio to let them in.
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("approved")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (profileErr) {
      return json(
        { error: "Approval check failed: " + profileErr.message },
        { status: 500 },
      );
    }
    if (!profile?.approved) {
      return json(
        {
          error: "Your account is pending approval. The admin will let you in soon.",
          code: "not_approved",
        },
        { status: 403 },
      );
    }
  }

  // Parse request body before charging quota — a malformed request shouldn't
  // burn one of the user's daily extractions.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  if (!isExempt) {
    // Per-user daily rate limit (atomic check-and-increment inside Postgres).
    const DAILY_LIMIT = 10;
    const { data: rateRows, error: rateErr } = await supabase
      .rpc("check_and_increment_ai_usage", { lim: DAILY_LIMIT });
    if (rateErr) {
      return json({ error: "Rate check failed: " + rateErr.message }, { status: 500 });
    }
    const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
    if (!rate?.allowed) {
      return json(
        {
          error: `Daily limit reached (${DAILY_LIMIT} extractions/day). Try again tomorrow.`,
          code: "rate_limited",
          used: rate?.current_count ?? DAILY_LIMIT,
          limit: DAILY_LIMIT,
        },
        { status: 429 },
      );
    }
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  // Pass through Anthropic's response (status + body) so the client error
  // handling continues to work.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
