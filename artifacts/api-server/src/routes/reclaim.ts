import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateCompletionBody,
  CreateManualEntryBody,
  GetHistoryResponse,
  GetRecommendationsQueryParams,
  GetRecommendationsResponse,
  GetSummaryResponse,
  GetWeeklySummaryResponse,
} from "@workspace/api-zod";
import { db, reclaimCompletionsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../auth";
import { activityCatalog, findActivity } from "../activityCatalog";
import {
  completionsBetween,
  ensureUser,
  getBillingStatus,
  hasReclaimAccess,
  recentCompletions,
} from "../userStore";

const router: IRouter = Router();
router.use(requireAuth);

function requestUser(req: AuthenticatedRequest) {
  return ensureUser(req.userId, req.userEmail);
}

function serializeCompletion(completion: {
  id: number;
  title: string;
  durationMinutes: number;
  category: string;
  completedAt: Date;
  source: string;
}) {
  return {
    id: String(completion.id),
    title: completion.title,
    durationMinutes: completion.durationMinutes,
    category: completion.category,
    completedAt: completion.completedAt,
    source: completion.source === "manual" ? "manual" as const : "activity" as const,
  };
}

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

router.get("/summary", async (req, res): Promise<void> => {
  const user = await requestUser(req as AuthenticatedRequest);
  if (!hasReclaimAccess(user)) {
    res.status(402).json({ error: "Your Reclaim trial has ended" });
    return;
  }
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const completions = await recentCompletions(user.id, 500);
  const today = startOfDay(now).getTime();
  const categories = new Map<string, number>();
  let todayMinutes = 0;
  let monthMinutes = 0;
  let yearMinutes = 0;
  for (const completion of completions) {
    const time = completion.completedAt.getTime();
    if (time >= yearStart.getTime()) yearMinutes += completion.durationMinutes;
    if (time >= monthStart.getTime()) monthMinutes += completion.durationMinutes;
    if (time >= today) todayMinutes += completion.durationMinutes;
    categories.set(
      completion.category,
      (categories.get(completion.category) ?? 0) + completion.durationMinutes,
    );
  }
  res.json(
    GetSummaryResponse.parse({
      todayMinutes,
      monthMinutes,
      yearMinutes,
      sessions: completions.length,
      categories: Array.from(categories, ([category, minutes]) => ({ category, minutes }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 6),
    }),
  );
});

router.get("/recommendations", async (req, res): Promise<void> => {
  const user = await requestUser(req as AuthenticatedRequest);
  if (!hasReclaimAccess(user)) {
    res.status(402).json({ error: "Your Reclaim trial has ended" });
    return;
  }
  const parsed = GetRecommendationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { minutes, mood, refresh = 0 } = parsed.data;
  const history = await recentCompletions(user.id, 100);
  const historyTitles = new Set(history.slice(0, 12).map((entry) => entry.title.split(" · ")[0]));
  const interests = new Set(user.interests);
  const scored = activityCatalog
    .map((activity) => {
      const moodScore = activity.moods.includes(mood) ? 8 : 0;
      const interestScore = activity.interests.reduce(
        (score, interest) => score + (interests.has(interest) ? 3 : 0),
        0,
      );
      const durationScore = Math.max(0, 5 - Math.abs(activity.durationMinutes - minutes) / 10);
      const freshnessScore = historyTitles.has(activity.title.split(" · ")[0]) ? -4 : 2;
      return { activity, score: moodScore + interestScore + durationScore + freshnessScore };
    })
    .sort((a, b) => b.score - a.score || a.activity.id.localeCompare(b.activity.id));
  const offset = (refresh * 3) % Math.max(1, scored.length - 3);
  const activities = [
    ...scored.slice(offset, offset + 3),
    ...scored.slice(0, Math.max(0, offset + 3 - scored.length)),
  ]
    .map(({ activity }) => activity)
    .slice(0, 3);
  res.json(GetRecommendationsResponse.parse({ activities }));
});

router.post("/completions", async (req, res): Promise<void> => {
  const user = await requestUser(req as AuthenticatedRequest);
  if (!hasReclaimAccess(user)) {
    res.status(402).json({ error: "Your Reclaim trial has ended" });
    return;
  }
  const parsed = CreateCompletionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const activity = findActivity(parsed.data.activityId);
  if (!activity) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  const durationMinutes = Math.min(parsed.data.durationMinutes, activity.durationMinutes);
  const [completion] = await db
    .insert(reclaimCompletionsTable)
    .values({
      userId: user.id,
      activityId: activity.id,
      title: activity.title,
      durationMinutes,
      category: activity.category,
      source: "activity",
    })
    .returning();
  res.status(201).json(serializeCompletion(completion));
});

router.post("/manual-entries", async (req, res): Promise<void> => {
  const user = await requestUser(req as AuthenticatedRequest);
  if (!hasReclaimAccess(user)) {
    res.status(402).json({ error: "Your Reclaim trial has ended" });
    return;
  }
  const parsed = CreateManualEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [completion] = await db
    .insert(reclaimCompletionsTable)
    .values({
      userId: user.id,
      title: parsed.data.title,
      durationMinutes: parsed.data.durationMinutes,
      category: parsed.data.category,
      source: "manual",
    })
    .returning();
  res.status(201).json(serializeCompletion(completion));
});

router.get("/history", async (req, res): Promise<void> => {
  const user = await requestUser(req as AuthenticatedRequest);
  const completions = await recentCompletions(user.id, 100);
  res.json(GetHistoryResponse.parse({ entries: completions.map(serializeCompletion) }));
});

router.get("/weekly-summary", async (req, res): Promise<void> => {
  const user = await requestUser(req as AuthenticatedRequest);
  const end = new Date();
  const start = new Date(startOfDay(end).getTime() - 6 * 24 * 60 * 60 * 1000);
  const completions = await completionsBetween(user.id, start, end);
  const daily = new Map<string, number>();
  const categories = new Map<string, number>();
  const activities = new Map<string, number>();
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(start.getTime() + index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    daily.set(day, 0);
  }
  for (const completion of completions) {
    const day = completion.completedAt.toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + completion.durationMinutes);
    categories.set(completion.category, (categories.get(completion.category) ?? 0) + completion.durationMinutes);
    activities.set(completion.title, (activities.get(completion.title) ?? 0) + 1);
  }
  const totalMinutes = completions.reduce((total, completion) => total + completion.durationMinutes, 0);
  const topCategory = Array.from(categories.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const insight =
    totalMinutes >= 60
      ? topCategory
        ? `You made the most room for ${topCategory.toLowerCase()} this week.`
        : "You made a meaningful amount of room for yourself this week."
      : null;
  res.json(
    GetWeeklySummaryResponse.parse({
      totalMinutes,
      dailyMinutes: Array.from(daily, ([day, minutes]) => ({ day, minutes })),
      categories: Array.from(categories, ([category, minutes]) => ({ category, minutes })),
      topActivities: Array.from(activities, ([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      insight,
    }),
  );
});

export default router;