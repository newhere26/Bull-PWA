import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db, reclaimCompletionsTable, reclaimUsersTable, type ReclaimUser } from "@workspace/db";

export const TRIAL_DAYS = 14;

export async function ensureUser(userId: string, email: string): Promise<ReclaimUser> {
  const existing = await db
    .select()
    .from(reclaimUsersTable)
    .where(eq(reclaimUsersTable.id, userId))
    .limit(1);
  if (existing[0]) {
    if (existing[0].email !== email && email !== "member@reclaim.app") {
      const [updated] = await db
        .update(reclaimUsersTable)
        .set({ email, updatedAt: new Date() })
        .where(eq(reclaimUsersTable.id, userId))
        .returning();
      return updated;
    }
    return existing[0];
  }

  const [created] = await db
    .insert(reclaimUsersTable)
    .values({ id: userId, email })
    .returning();
  return created;
}

export function getBillingStatus(user: ReclaimUser) {
  const now = Date.now();
  const trialEndsAt = new Date(
    user.trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  );
  const periodEnd = user.currentPeriodEnd?.getTime() ?? 0;
  const subscriptionStatus = user.subscriptionStatus;
  const subscriptionIsActive =
    subscriptionStatus === "active" || subscriptionStatus === "trialing";
  const hasGracefulAccess =
    subscriptionIsActive || (subscriptionStatus === "canceled" && periodEnd > now);

  let state: "trial" | "active" | "past_due" | "canceled" | "expired";
  if (hasGracefulAccess && subscriptionStatus === "canceled") state = "canceled";
  else if (subscriptionIsActive) state = "active";
  else if (subscriptionStatus === "past_due") state = "past_due";
  else if (now < trialEndsAt.getTime()) state = "trial";
  else if (subscriptionStatus === "canceled") state = "canceled";
  else state = "expired";

  return {
    state,
    trialDaysRemaining: Math.max(
      0,
      Math.ceil((trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000)),
    ),
    trialEndsAt,
    subscriptionStatus,
    currentPeriodEnd: user.currentPeriodEnd,
    plan: user.plan,
  };
}

export function hasReclaimAccess(user: ReclaimUser): boolean {
  const status = getBillingStatus(user);
  return status.state === "trial" || status.state === "active" || status.state === "canceled";
}

export async function recentCompletions(userId: string, limit = 100) {
  return db
    .select()
    .from(reclaimCompletionsTable)
    .where(eq(reclaimCompletionsTable.userId, userId))
    .orderBy(desc(reclaimCompletionsTable.completedAt))
    .limit(limit);
}

export async function completionsBetween(userId: string, start: Date, end: Date) {
  return db
    .select()
    .from(reclaimCompletionsTable)
    .where(
      and(
        eq(reclaimCompletionsTable.userId, userId),
        gte(reclaimCompletionsTable.completedAt, start),
        lt(reclaimCompletionsTable.completedAt, end),
      ),
    )
    .orderBy(desc(reclaimCompletionsTable.completedAt));
}