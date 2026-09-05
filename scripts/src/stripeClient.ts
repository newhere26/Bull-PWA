import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function stripeRequest<T>(
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