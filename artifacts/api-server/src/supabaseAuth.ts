import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthenticatedRequest } from "./auth";

// New Supabase projects sign JWTs with ES256 (asymmetric). Verification uses
// the project's JWKS document; the legacy HS256 shared secret is kept as a
// fallback for older projects.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedBase = "";

function supabaseBase(): string | null {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return base && base.length > 0 ? base : null;
}

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  const base = supabaseBase();
  if (!base) return null;
  if (!cachedJwks || cachedBase !== base) {
    cachedBase = base;
    cachedJwks = createRemoteJWKSet(
      new URL(`${base}/auth/v1/.well-known/jwks.json`),
    );
  }
  return cachedJwks;
}

function getLegacySecret(): Uint8Array | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  const jwks = getJwks();
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks);
      return payload as Record<string, unknown>;
    } catch {
      // Fall through to the legacy shared secret.
    }
  }
  const secret = getLegacySecret();
  if (secret) {
    try {
      const { payload } = await jwtVerify(token, secret);
      return payload as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Soft-attach: verifies the Supabase JWT from `Authorization: Bearer …` and
 * stamps userId/userEmail on the request when valid. Never rejects — that is
 * requireAuth's job — so public routes keep working.
 */
export async function attachSupabaseUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : null;
    if (token) {
      const payload = await verifyToken(token);
      const sub = payload?.sub;
      if (typeof sub === "string" && sub.length > 0) {
        const authed = req as AuthenticatedRequest;
        authed.userId = sub;
        const email = payload?.email;
        if (typeof email === "string" && email.length > 0) {
          authed.userEmail = email;
        }
      }
    }
  } catch {
    // Invalid/expired token → anonymous request; requireAuth rejects it downstream.
  }
  next();
}
