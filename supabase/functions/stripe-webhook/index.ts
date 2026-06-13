// ============================================================================
// Stripe Webhook Edge Function
// ============================================================================
// Receives Stripe events and keeps user_profiles in sync with subscription state.
//
// Handled events:
//   checkout.session.completed    → activate plan
//   customer.subscription.updated → update plan/status/period
//   customer.subscription.deleted → reset to free
//
// Deploy:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//
// Register endpoint in Stripe Dashboard:
//   https://fslrqqaplwfyqemdumfz.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

// Maps Stripe product metadata plan_name → monthly invoice limit
const PLAN_LIMITS: Record<string, number> = {
  starter: 50,
  growth: 150,
  pro: 400,
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!sig || !webhookSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-04-10",
  });

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return new Response("ok");

      // Retrieve the subscription to get current_period_end and price/product
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string,
        { expand: ["items.data.price.product"] },
      );

      await activatePlan(supabase, stripe, subscription, session.client_reference_id, session.customer as string);
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const expandedSub = await stripe.subscriptions.retrieve(
        subscription.id,
        { expand: ["items.data.price.product"] },
      );
      await activatePlan(supabase, stripe, expandedSub, null, subscription.customer as string);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await resetToFree(supabase, subscription.customer as string);
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

async function activatePlan(
  supabase: ReturnType<typeof createClient>,
  _stripe: Stripe,
  subscription: Stripe.Subscription,
  clientRefId: string | null,
  customerId: string,
) {
  // Extract plan name from product metadata
  const item = subscription.items.data[0];
  const product = item.price.product as Stripe.Product;
  const planName = product.metadata?.plan_name ?? "starter";
  const invoiceLimit = parseInt(product.metadata?.invoice_limit ?? "35", 10);

  const updates = {
    subscription_plan: planName,
    subscription_status: subscription.status,
    billing_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    invoice_limit: invoiceLimit,
    stripe_customer_id: customerId,
    approved: true,
  };

  // Try to find user by client_reference_id first (most reliable on first checkout)
  if (clientRefId) {
    const { error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("user_id", clientRefId);
    if (!error) return;
    console.warn("client_reference_id lookup failed, falling back to customer ID:", error.message);
  }

  // Fallback: match by stripe_customer_id
  await supabase
    .from("user_profiles")
    .update(updates)
    .eq("stripe_customer_id", customerId);
}

async function resetToFree(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
) {
  await supabase
    .from("user_profiles")
    .update({
      subscription_plan: "free",
      subscription_status: "canceled",
      billing_period_end: null,
      invoice_limit: 0,
    })
    .eq("stripe_customer_id", customerId);
}
