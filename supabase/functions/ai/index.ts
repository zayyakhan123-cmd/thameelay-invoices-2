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

// Retry the upstream Anthropic call on transient failures.
//
// Retriable: HTTP 429/502/503/504/529, OR a parsed body whose type/error.type/
// message/error.message contains "overloaded" or "rate_limit". Other 4xx are
// real failures (auth, malformed request) and propagate immediately.
//
// 3 total attempts; sleeps 2s before attempt 2 and 5s before attempt 3.
// Each attempt is logged for incident debugging via supabase function logs.
//
// On exhaustion the caller gets a 503 with a friendly busy-message; the
// raw response from the final attempt is otherwise passed through unchanged.
export async function callAnthropicWithRetry(
  body: unknown,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const MAX_ATTEMPTS = 3;
  const SLEEPS_MS = [0, 2000, 5000]; // sleep BEFORE attempt N (1-indexed)
  const RETRY_STATUSES = new Set([429, 502, 503, 504, 529]);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const ms = SLEEPS_MS[attempt - 1];
      await new Promise((r) => setTimeout(r, ms));
    }

    const resp = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let parsed: { type?: string; message?: string; error?: { type?: string; message?: string } } | null = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON body — fine, won't trip retry */ }

    const sigs = [
      parsed?.type, parsed?.message,
      parsed?.error?.type, parsed?.error?.message,
    ].map((s) => (s || "").toString().toLowerCase());
    const bodySignalsTransient = sigs.some((s) =>
      s.includes("overloaded") || s.includes("rate_limit")
    );

    const retriable = RETRY_STATUSES.has(resp.status) || bodySignalsTransient;
    const errType = parsed?.error?.type || parsed?.type || "";

    console.log(
      `[ai-retry] attempt=${attempt}/${MAX_ATTEMPTS} status=${resp.status} errType=${errType || "none"} retriable=${retriable}`,
    );

    if (!retriable) {
      // Real success OR real non-retriable failure — pass through unchanged.
      return new Response(text, {
        status: resp.status,
        headers: { "Content-Type": resp.headers.get("Content-Type") || "application/json" },
      });
    }

    // Retriable. If more attempts remain, loop. Otherwise fall through to the
    // friendly 503 below.
  }

  console.log(`[ai-retry] exhausted ${MAX_ATTEMPTS} attempts — returning 503`);
  return new Response(
    JSON.stringify({ error: "Anthropic AI is currently busy. Please wait a moment and try again." }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}

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

  const upstream = await callAnthropicWithRetry(body, apiKey);

  // Pass through Anthropic's response (status + body) so the client error
  // handling continues to work. On exhausted retries the helper returns its
  // own 503 with a friendly message.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
