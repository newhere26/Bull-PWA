import { stripeRequest } from "./stripeClient";

type Product = {
  id: string;
  name: string;
  metadata?: Record<string, string>;
};

type Price = {
  id: string;
  recurring?: { interval: string };
};

async function seedProducts() {
  const products = await stripeRequest<{ data: Product[] }>(
    "/v1/products?active=true&limit=100",
  );
  let product = products.data.find(
    (item) => item.metadata?.reclaim === "true" || item.name === "Reclaim Membership",
  );

  if (!product) {
    product = await stripeRequest<Product>("/v1/products", {
      method: "POST",
      body: {
        name: "Reclaim Membership",
        description: "A calmer way to make room for what matters.",
        "metadata[reclaim]": "true",
      },
    });
    console.log(`Created Reclaim product ${product.id}`);
  }

  const prices = await stripeRequest<{ data: Price[] }>(
    `/v1/prices?product=${encodeURIComponent(product.id)}&active=true&limit=100`,
  );
  const intervals = new Set(prices.data.map((price) => price.recurring?.interval));

  if (!intervals.has("month")) {
    const monthly = await stripeRequest<{ id: string }>("/v1/prices", {
      method: "POST",
      body: {
        product: product.id,
        unit_amount: 799,
        currency: "usd",
        "recurring[interval]": "month",
      },
    });
    console.log(`Created monthly price ${monthly.id}`);
  }

  if (!intervals.has("year")) {
    const yearly = await stripeRequest<{ id: string }>("/v1/prices", {
      method: "POST",
      body: {
        product: product.id,
        unit_amount: 5999,
        currency: "usd",
        "recurring[interval]": "year",
      },
    });
    console.log(`Created yearly price ${yearly.id}`);
  }

  console.log("Reclaim plans are ready: $7.99/month or $59.99/year.");
}

seedProducts().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});