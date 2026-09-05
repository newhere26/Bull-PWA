import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export type StripeRestProduct = {
  id: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, string>;
};

export type StripeRestPrice = {
  id: string;
  active: boolean;
  type: string;
  product: string | StripeRestProduct;
  unit_amount: number | null;
  currency: string;
  recurring?: { interval: "day" | "week" | "month" | "year" } | null;
};

async function stripeRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const body = options.body
    ? new URLSearchParams(
        Object.entries(options.body)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;
  const response = await connectors.proxy("stripe", path, {
    method: options.method ?? "GET",
    body,
    headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
  });
  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Stripe request failed: ${response.status}`);
  }
  return payload;
}

export async function listReclaimProducts() {
  const [products, prices] = await Promise.all([
    stripeRequest<{ data: StripeRestProduct[] }>("/v1/products?active=true&limit=100"),
    stripeRequest<{ data: StripeRestPrice[] }>("/v1/prices?active=true&type=recurring&limit=100"),
  ]);
  return products.data
    .filter((product) => product.metadata?.reclaim === "true")
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
}

export async function retrievePrice(id: string) {
  return stripeRequest<StripeRestPrice>(`/v1/prices/${encodeURIComponent(id)}`);
}

export async function retrieveProduct(id: string) {
  return stripeRequest<StripeRestProduct>(`/v1/products/${encodeURIComponent(id)}`);
}

export async function createCustomer(email: string, reclaimUserId: string) {
  return stripeRequest<{ id: string }>("/v1/customers", {
    method: "POST",
    body: { email, "metadata[reclaimUserId]": reclaimUserId },
  });
}

export async function createCheckoutSession(input: {
  customer: string;
  price: string;
  successUrl: string;
  cancelUrl: string;
  reclaimUserId: string;
}) {
  return stripeRequest<{ url?: string }>("/v1/checkout/sessions", {
    method: "POST",
    body: {
      customer: input.customer,
      mode: "subscription",
      "line_items[0][price]": input.price,
      "line_items[0][quantity]": 1,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "metadata[reclaimUserId]": input.reclaimUserId,
      "subscription_data[metadata][reclaimUserId]": input.reclaimUserId,
    },
  });
}

export async function createPortalSession(customer: string, returnUrl: string) {
  return stripeRequest<{ url: string }>("/v1/billing_portal/sessions", {
    method: "POST",
    body: { customer, return_url: returnUrl },
  });
}

export async function listCustomers(email: string) {
  return stripeRequest<{ data: Array<{ id: string }> }>(
    `/v1/customers?email=${encodeURIComponent(email)}&limit=10`,
  );
}

export type StripeRestSubscription = {
  id: string;
  status: string;
  created: number;
  items?: { data?: Array<{ current_period_end?: number; price?: { recurring?: { interval?: string } } }> };
};

export async function listSubscriptions(customer: string) {
  return stripeRequest<{ data: StripeRestSubscription[] }>(
    `/v1/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`,
  );
}