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

// CORS: only allow requests from the production domain.
// Vercel preview URLs (*.vercel.app) and localhost are blocked — add them
// to ALLOWED_ORIGINS if local dev against live Edge Functions is needed.
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
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json", ...(init.headers || {}) },
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
  const origin = req.headers.get("Origin");

  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, origin, { status: 405 });

  // Server-side configuration
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !anonKey || !apiKey) {
    return json(
      { error: "Server misconfigured: missing SUPABASE_URL, SUPABASE_ANON_KEY, or ANTHROPIC_API_KEY" },
      origin,
      { status: 500 },
    );
  }

  // Authenticate the caller via their Supabase JWT.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not authenticated" }, origin, { status: 401 });

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return json({ error: "Invalid session" }, origin, { status: 401 });
  }

  // Exemption — comma-separated list of UUIDs in EXEMPT_USER_IDS skip the
  // approval gate and the daily cap entirely. Used so the admin can test
  // and burn invoices without locking themselves out.
  const exemptRaw = Deno.env.get("EXEMPT_USER_IDS") || "";
  const exemptSet = new Set(
    exemptRaw.split(",").map((s) => s.trim()).filter(Boolean),
  );
  const isExempt = exemptSet.has(userData.user.id);

  // (Approval gate removed: signups auto-approve (handle_new_user) and billing
  // now gates access. The old invite-only `approved` check could 403 a brand-new
  // self-serve user if the auto-approve trigger raced or failed — a silent
  // dead-end with no recovery. Access is enforced by the monthly quota below.)

  // Parse request body before charging quota — a malformed request shouldn't
  // burn one of the user's daily extractions.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON in request body" }, origin, { status: 400 });
  }

  if (!isExempt) {
    // Per-user monthly quota — reads invoice_limit from user_profiles (set by
    // Stripe webhook) and counts invoices saved this calendar month.
    const { data: quotaRows, error: quotaErr } = await supabase
      .rpc("check_ai_monthly_quota");
    if (quotaErr) {
      return json({ error: "Quota check failed: " + quotaErr.message }, origin, { status: 500 });
    }
    const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
    if (!quota?.allowed) {
      // resets_at is null for the one-time free trial — don't render "Resets null".
      const msg = quota.resets_at
        ? `Monthly limit reached (${quota.current_count}/${quota.monthly_limit} invoices). Resets ${quota.resets_at}.`
        : `Free trial used up (${quota.current_count}/${quota.monthly_limit} invoices). Upgrade to keep extracting.`;
      return json(
        {
          error: msg,
          code: "rate_limited",
          used: quota.current_count,
          limit: quota.monthly_limit,
          resets_at: quota.resets_at,
        },
        origin,
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
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
});
