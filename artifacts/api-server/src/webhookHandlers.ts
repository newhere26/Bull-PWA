import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, reclaimUsersTable } from "@workspace/db";
import { getStripeWebhookSecret, getUncachableStripeClient, getStripeSync } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a Buffer");
    }
    const stripe = await getUncachableStripeClient();
    const secret = await getStripeWebhookSecret();
    const event = secret
      ? stripe.webhooks.constructEvent(payload, signature, secret)
      : null;

    if (event) {
      const object = event.data.object as Stripe.Subscription;
      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        const customerId =
          typeof object.customer === "string" ? object.customer : object.customer.id;
        const item = object.items.data[0];
        const interval = item?.price.recurring?.interval;
        await db
          .update(reclaimUsersTable)
          .set({
            stripeCustomerId: customerId,
            stripeSubscriptionId: object.id,
            subscriptionStatus: object.status,
            currentPeriodEnd: item?.current_period_end
              ? new Date(item.current_period_end * 1000)
              : null,
            plan: interval === "year" ? "yearly" : interval === "month" ? "monthly" : null,
          })
          .where(eq(reclaimUsersTable.stripeCustomerId, customerId));
      }
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}