import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCompletionBody,
  CreateManualEntryBody,
  GetHistoryResponse,
  GetRecommendationsQueryParams,
  GetRecommendationsResponse,
  GetSummaryResponse,
  GetWeeklySummaryResponse,
  ListActivitiesResponse,
} from "@workspace/api-zod";
import { db, reclaimCompletionsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../auth";
import { activityCatalog, findActivity } from "../activityCatalog";
import {
  completionsBetween,
  ensureUser,
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

// Strips legacy " · N min" duration suffixes so old completion rows still
// match their seed. Used ONLY by the friction-signal waiver set — the
// freshness window intentionally keeps raw-title matching, untouched.
function baseTitle(title: string): string {
  return title.replace(/\s·\s\d+\smin$/, "");
}

// Onboarding choices mapped to catalog interest tags. Without this, interest
// scores are always zero because users pick Move/Make/Learn/Connect/Rest while
// seeds are tagged Fitness/Creativity/Learning/Social/Mindfulness/….
const INTEREST_ALIASES: Record<string, string[]> = {
  Move: ["Fitness", "Outdoors"],
  Make: ["Creativity", "Cooking", "Building"],
  Learn: ["Learning", "Reading", "Curiosity", "Puzzles"],
  Connect: ["Social", "Music"],
  Rest: ["Mindfulness", "Writing"],
};

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
  const { minutes, mood, refresh = 0, hour } = parsed.data;
  const history = await recentCompletions(user.id, 100);
  const historyTitles = new Set(history.slice(0, 12).map((entry) => entry.title));
  const interests = new Set(
    user.interests.flatMap((interest) => [interest, ...(INTEREST_ALIASES[interest] ?? [])]),
  );
  // Device-local hour comes from the client (the server has no device clock).
  // Day is 06:00–17:59 local; anything else is night. Missing hour = no signal.
  const deviceTimeOfDay =
    hour == null ? null : hour >= 6 && hour < 18 ? ("day" as const) : ("night" as const);
  // Full-history waiver set (titles only, suffix-normalized so pre-seed-model
  // rows like "X · 10 min" still match their seed). Freshness above
  // intentionally still uses raw titles against the last 12 — untouched.
  const everTitles = new Set(
    (
      await db
        .select({ title: reclaimCompletionsTable.title })
        .from(reclaimCompletionsTable)
        .where(eq(reclaimCompletionsTable.userId, user.id))
    ).map((row) => baseTitle(row.title)),
  );
  // Scoring: additive weighted signals over the full catalog.
  //   mood +8/0 ........... seed matches the chosen mood (dominant filter)
  //   interest +3/tag ..... seed tag matches user interests (via INTEREST_ALIASES)
  //   suitability +2/0 .... chosen minutes fall inside the seed's usual range
  //   freshness +2/-4 ..... seed absent/present in the last 12 completions
  //   solo friction -3/0 .. seed needs another person AND user never completed it
  //   materials friction -1/0  seed needs specific materials AND never completed
  //   context mismatch -3/0  seed's timeOfDay conflicts with the device-local hour
  // Ties break alphabetically by seed id. Nothing is ever filtered out.
  const scored = activityCatalog
    .map((activity) => {
      const moodScore = activity.moods.includes(mood) ? 8 : 0;
      const interestScore = activity.interests.reduce(
        (score, interest) => score + (interests.has(interest) ? 3 : 0),
        0,
      );
      const suitabilityScore =
        minutes == null
          ? 0
          : minutes >= activity.minMinutes && minutes <= activity.maxMinutes
            ? 2
            : 0;
      const freshnessScore = historyTitles.has(activity.title) ? -4 : 2;
      const everDone = everTitles.has(baseTitle(activity.title));
      const soloFriction = activity.requiresOther && !everDone ? -3 : 0;
      const materialsFriction = activity.requiresMaterials === "specific" && !everDone ? -1 : 0;
      const contextMismatch =
        activity.conditions?.timeOfDay && deviceTimeOfDay && activity.conditions.timeOfDay !== deviceTimeOfDay
          ? -3
          : 0;
      return {
        activity,
        score:
          moodScore + interestScore + suitabilityScore + freshnessScore +
          soloFriction + materialsFriction + contextMismatch,
      };
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

router.get("/activities", async (_req, res): Promise<void> => {
  res.json(ListActivitiesResponse.parse({ activities: activityCatalog }));
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
  // Actual minutes run on the timer (schema bounds: 1–240).
  const durationMinutes = parsed.data.durationMinutes;
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
  const activities = new Map<string, { count: number; minutes: number }>();
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
    const entry = activities.get(completion.title) ?? { count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += completion.durationMinutes;
    activities.set(completion.title, entry);
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
      topActivities: Array.from(activities, ([title, stats]) => ({ title, ...stats }))
        .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
        .slice(0, 5),
      insight,
    }),
  );
});

export default router;