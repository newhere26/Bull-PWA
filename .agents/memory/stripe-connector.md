---
name: Stripe connector access
description: This workspace's attached Stripe connection exposes the Replit connector proxy but not a secret_key through the connection API.
---

Use the attached Replit Stripe connector proxy for Stripe REST reads and writes when the secret-based Stripe SDK path reports a missing secret. Keep billing state durable in the app database and use Stripe customer lookup/restore to reconcile account status.

**Why:** The connection is authorized and usable, but the standard stripe-replit-sync credential lookup returns no secret in this environment.

**How to apply:** Prefer connector-proxy REST calls for product, price, checkout, portal, customer, and subscription operations; treat secret-based sync initialization as optional rather than blocking API startup.