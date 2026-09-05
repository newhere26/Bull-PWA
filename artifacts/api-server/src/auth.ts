import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export type AuthenticatedRequest = Request & {
  userId: string;
  userEmail: string;
};

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  const userEmail =
    typeof claims?.email === "string" ? claims.email : "member@reclaim.app";
  const authenticatedRequest = req as AuthenticatedRequest;
  authenticatedRequest.userId = userId;
  authenticatedRequest.userEmail = userEmail;
  next();
}