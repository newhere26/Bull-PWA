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
import {
  createCheckoutSession,
  createCustomer,
  createPortalSession,
  listCustomers,
  listReclaimProducts,
  listSubscriptions,
  retrievePrice,
  retrieveProduct,
} from "../stripeRest";
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
  const plans = await listReclaimProducts();
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
  const price = await retrievePrice(parsed.data.priceId);
  if (!price.active || price.type !== "recurring" || typeof price.product !== "string") {
    res.status(400).json({ error: "That Reclaim plan is not available" });
    return;
  }
  const product = await retrieveProduct(price.product);
  if (product.metadata?.reclaim !== "true") {
    res.status(400).json({ error: "That Reclaim plan is not available" });
    return;
  }
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await createCustomer(user.email, user.id);
    customerId = customer.id;
    await db
      .update(reclaimUsersTable)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(reclaimUsersTable.id, user.id));
  }
  const origin = originFor(auth);
  const session = await createCheckoutSession({
    customer: customerId,
    price: price.id,
    successUrl: `${origin}/app?checkout=success`,
    cancelUrl: `${origin}/pricing`,
    reclaimUserId: user.id,
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
  const session = await createPortalSession(
    user.stripeCustomerId,
    `${originFor(auth)}/settings`,
  );
  res.json(CreateBillingPortalResponse.parse({ url: session.url }));
});

router.post("/billing/restore", async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const user = await ensureUser(auth.userId, auth.userEmail);
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customers = await listCustomers(user.email);
    customerId = customers.data[0]?.id;
  }
  if (!customerId) {
    res.json(RestoreBillingResponse.parse(getBillingStatus(user)));
    return;
  }
  const subscriptions = await listSubscriptions(customerId);
  const subscription = subscriptions.data
    .filter((item) => item.status !== "incomplete" && item.status !== "incomplete_expired")
    .sort((a, b) => b.created - a.created)[0];
  const item = subscription?.items?.data?.[0];
  const interval = item?.price?.recurring?.interval;
  const [updated] = await db
    .update(reclaimUsersTable)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription?.id ?? null,
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      plan: interval === "year" ? "yearly" : interval === "month" ? "monthly" : null,
      updatedAt: new Date(),
    })
    .where(eq(reclaimUsersTable.id, user.id))
    .returning();
  res.json(RestoreBillingResponse.parse(getBillingStatus(updated)));
});

export default router;