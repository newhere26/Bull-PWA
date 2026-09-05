import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { GetMeResponse, UpdateMeBody, UpdateMeResponse } from "@workspace/api-zod";
import { db, reclaimUsersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../auth";
import { ensureUser, getBillingStatus } from "../userStore";

const router: IRouter = Router();
router.use(requireAuth);

function serializeUser(user: Awaited<ReturnType<typeof ensureUser>>) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    onboardingComplete: user.onboardingComplete,
    interests: user.interests ?? [],
    scrollWindow: user.scrollWindow,
    dailyScrollMinutes: user.dailyScrollMinutes,
    access: getBillingStatus(user),
  };
}

router.get("/me", async (req, res): Promise<void> => {
  const user = await ensureUser(
    (req as AuthenticatedRequest).userId,
    (req as AuthenticatedRequest).userEmail,
  );
  res.json(GetMeResponse.parse(serializeUser(user)));
});

router.patch("/me", async (req, res): Promise<void> => {
  const authenticatedRequest = req as AuthenticatedRequest;
  const user = await ensureUser(authenticatedRequest.userId, authenticatedRequest.userEmail);
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(reclaimUsersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(reclaimUsersTable.id, user.id))
    .returning();
  res.json(UpdateMeResponse.parse(serializeUser(updated)));
});

export default router;