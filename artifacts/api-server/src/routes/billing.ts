import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  CreateBillingCheckoutBody,
  CreateBillingCheckoutResponse,
  CreateBillingPortalResponse,
  GetBillingProductsResponse,
  GetBillingStatusResponse,
  RestoreBillingResponse,
} from "@workspace/api-zod";
import { db, reclaimUsersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../auth";
import { getUncachableStripeClient } from "../stripeClient";
import { ensureUser, getBillingStatus } from "../userStore";

const router: IRouter = Router();

function originFor(req: AuthenticatedRequest) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? req.get("host");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? req.protocol;
  return `${protocol}://${host}`;
}

router.get("/billing/products", async (_req, res): Promise<void> => {
  const stripe = await getUncachableStripeClient();
  const [products, prices] = await Promise.all([
    stripe.products.list({ active: true, limit: 100 }),
    stripe.prices.list({ active: true, limit: 100, type: "recurring" }),
  ]);
  const plans = products.data
    .filter((product) => product.metadata.reclaim === "true")
    .map((product) => {
      const productPrices = prices.data.filter(
        (price) => typeof price.product === "string" && price.product === product.id,
      );
      const monthly = productPrices.find((price) => price.recurring?.interval === "month");
      const yearly = productPrices.find((price) => price.recurring?.interval === "year");
      return {
        id: product.id,
        name: product.name,
        description: product.description ?? "A gentler way to make room for what matters.",
        monthlyPriceId: monthly?.id ?? null,
        yearlyPriceId: yearly?.id ?? null,
        monthlyAmount: monthly?.unit_amount ?? null,
        yearlyAmount: yearly?.unit_amount ?? null,
        currency: monthly?.currency ?? yearly?.currency ?? "usd",
      };
    });
  res.json(GetBillingProductsResponse.parse({ products: plans }));
});

router.use(requireAuth);

router.get("/billing/status", async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const user = await ensureUser(auth.userId, auth.userEmail);
  res.json(GetBillingStatusResponse.parse(getBillingStatus(user)));
});

router.post("/billing/checkout", async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const user = await ensureUser(auth.userId, auth.userEmail);
  const parsed = CreateBillingCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const stripe = await getUncachableStripeClient();
  const price = await stripe.prices.retrieve(parsed.data.priceId);
  if (!price.active || price.type !== "recurring" || typeof price.product !== "string") {
    res.status(400).json({ error: "That Reclaim plan is not available" });
    return;
  }
  const product = await stripe.products.retrieve(price.product);
  if (product.metadata.reclaim !== "true") {
    res.status(400).json({ error: "That Reclaim plan is not available" });
    return;
  }
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { reclaimUserId: user.id },
    });
    customerId = customer.id;
    await db
      .update(reclaimUsersTable)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(reclaimUsersTable.id, user.id));
  }
  const origin = originFor(auth);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/app?checkout=success`,
    cancel_url: `${origin}/pricing`,
    metadata: { reclaimUserId: user.id },
    subscription_data: { metadata: { reclaimUserId: user.id } },
  });
  if (!session.url) {
    res.status(502).json({ error: "Stripe did not return a checkout URL" });
    return;
  }
  res.json(CreateBillingCheckoutResponse.parse({ url: session.url }));
});

router.post("/billing/portal", async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const user = await ensureUser(auth.userId, auth.userEmail);
  if (!user.stripeCustomerId) {
    res.status(400).json({ error: "No billing account exists yet" });
    return;
  }
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${originFor(auth)}/settings`,
  });
  res.json(CreateBillingPortalResponse.parse({ url: session.url }));
});

router.post("/billing/restore", async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const user = await ensureUser(auth.userId, auth.userEmail);
  const stripe = await getUncachableStripeClient();
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customers = await stripe.customers.list({ email: user.email, limit: 10 });
    customerId = customers.data[0]?.id;
  }
  if (!customerId) {
    res.json(RestoreBillingResponse.parse(getBillingStatus(user)));
    return;
  }
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  const subscription = subscriptions.data
    .filter((item) => item.status !== "incomplete" && item.status !== "incomplete_expired")
    .sort((a, b) => b.created - a.created)[0];
  const item = subscription?.items.data[0];
  const interval = item?.price.recurring?.interval;
  const [updated] = await db
    .update(reclaimUsersTable)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription?.id ?? null,
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd: subscription?.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      plan: interval === "year" ? "yearly" : interval === "month" ? "monthly" : null,
      updatedAt: new Date(),
    })
    .where(eq(reclaimUsersTable.id, user.id))
    .returning();
  res.json(RestoreBillingResponse.parse(getBillingStatus(updated)));
});

export default router;