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

  // Forward the body to Anthropic. We don't massage the body — clients send the
  // same JSON they'd send to api.anthropic.com directly.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  // Optional: enforce a per-user usage cap here before calling out.
  // For now, we trust authenticated users. To add limits, query a usage table
  // keyed by userData.user.id and bail if over budget.

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
