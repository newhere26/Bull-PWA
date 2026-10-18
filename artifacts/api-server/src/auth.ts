import type { NextFunction, Request, Response } from "express";

export type AuthenticatedRequest = Request & {
  userId: string;
  userEmail: string;
};

/**
 * Hard gate: rejects requests that attachSupabaseUser did not stamp with a
 * verified userId. Route call sites are unchanged from the Clerk era.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authed = req as Partial<AuthenticatedRequest>;
  if (typeof authed.userId !== "string" || authed.userId.length === 0) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  (req as AuthenticatedRequest).userEmail =
    typeof authed.userEmail === "string" && authed.userEmail.length > 0
      ? authed.userEmail
      : "member@reclaim.app";
  next();
}