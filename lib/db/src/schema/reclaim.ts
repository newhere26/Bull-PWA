import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const reclaimUsersTable = pgTable("reclaim_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  scrollWindow: text("scroll_window"),
  dailyScrollMinutes: integer("daily_scroll_minutes"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull().defaultNow(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  plan: text("plan"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const reclaimCompletionsTable = pgTable("reclaim_completions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  activityId: text("activity_id"),
  title: text("title").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  category: text("category").notNull(),
  source: text("source").notNull().default("activity"),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReclaimUserSchema = createInsertSchema(reclaimUsersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertReclaimCompletionSchema = createInsertSchema(reclaimCompletionsTable).omit({
  id: true,
  completedAt: true,
});

export type ReclaimUser = typeof reclaimUsersTable.$inferSelect;
export type InsertReclaimUser = z.infer<typeof insertReclaimUserSchema>;
export type ReclaimCompletion = typeof reclaimCompletionsTable.$inferSelect;
export type InsertReclaimCompletion = z.infer<typeof insertReclaimCompletionSchema>;