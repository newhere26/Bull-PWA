# AGENTS.md — Reclaim-PWA Standalone Project

## 1. Project
Reclaim PWA ("make a little room") — mindfulness activity app. Migrating a
Replit-built monorepo to fully standalone: Web + installable PWA + Android
(Capacitor) + Desktop (Electron). Repo: `C:\Reclaim-PWA` (MUST stay outside
OneDrive — node_modules/.git/dist cause sync locks). Windows 11, PowerShell 5.1.

## 2. Locked decisions (do not revisit without user approval)
| Area | Decision |
|------|----------|
| Auth | Supabase Auth (free tier) — replaces Clerk entirely |
| Database | Supabase Postgres free tier (500MB) — keeps Drizzle `pg` + existing schema |
| Billing | **Razorpay** (Stripe dropped — unavailable for new Indian signups). Direct SDK, test mode first |
| Billing currency | INR + USD plan pairs (4 plans, currency toggle on pricing page) |
| Billing portal | No hosted portal — in-app Cancel (at period end) + resubscribe via checkout |
| Trial | 14-day app-side trial kept (`TRIAL_DAYS`); Razorpay handles paid subs only |
| Rejected | Firebase (NoSQL rewrite), SQLite (wiped on free hosts), custom auth, Tauri, React Native, Stripe |
| Platforms (in order) | Web (single-host) → PWA → Android (Capacitor) → Desktop (Electron) |
| Hosting | Single-host: Express serves `dist/public` + API. Render/Railway free tier |
| Spend | $0. Razorpay test keys first |
| Package manager | pnpm only (standalone install at `%LOCALAPPDATA%\pnpm\bin`; new shells get it via user PATH) |
| Catalog model | 100 duration-AGNOSTIC seeds (no ×5 multiplication). Users input time |
| Timer policy | Partial credit: finish after 60s banks elapsed minutes; zero-run banks full |
| Browse groups | Existing 13 categories. Mood filter chips on top (absorbs mood-first idea) |

## 3. Track plan (check off as completed)
- [x] 0 Baseline (2026-09-05): pnpm install → typecheck green; `.env` skeletons
- [x] 1 De-Replit (2026-09-05): plugins/config/gitignore/env; Clerk/Stripe dep entries
      kept until their rewrites (documented sequencing decision)
- [x] 2 Clerk→Supabase Auth (2026-09-05): client + session hook + custom forms +
      Bearer wiring + jose JWT middleware; browser-verified incl. sign-out
- [x] 3 DB→Supabase Postgres (2026-09-05): tables pushed; RLS deny-by-default;
      StripeSync boot deleted; ES256/JWKS verify; full-loop browser-verified;
      fixed pre-existing onboarding race (await me-refetch before navigate)
- [x] F1 Activity model + discovery + honest timer (done 2026-09-05, browser-verified):
      100 seeds (31 rework + 69 new, min/max each); Browse (13 categories + mood
      chips + custom card); TimeEntry (suggestion + out-of-range nudge + custom
      form); dynamic-duration ActivityPage with pause/resume + elapsed +
      tab-hide auto-pause + partial credit + auto-finish; suitability scoring +
      interest aliases; completions actual minutes (1–240); spec + codegen regen
- [x] F2 Goals (done 2026-09-05, browser-verified): goal columns + push; Me/MeUpdate
      spec + codegen; settings targets (save + null-clear verified); dashboard
      daily/yearly bars + empty state; weekly bar. 12-min test data consistent
      everywhere, console clean.
- [x] F3 Dark mode (done 2026-09-05, 12 pages screenshotted dark + light regression):
      14 structural colors → theme tokens; 12 targeted dark:text fixes (peach/
      mustard/sage surfaces); mood-button inline style → theme-aware classes;
      rec-card inherit trick; insight card; category bars dark track/coral fill;
      fixed pre-existing weekday-label bug (showed "202"). Light pixel-faithful.
- [x] F4 Animations (done 2026-09-05, mounted-clean + values verified): shared
      motion.tsx (FadeIn/Rise/Pop/CountUp, MotionConfig reducedMotion=user);
      PageFrame fade, rec/mood/time/history staggers, dashboard count-ups,
      completion spring-pop, Button whileTap press, AuthForm fade. Nothing
      sourced online. Bundle +125KB (code-split later).
- [ ] P1 Razorpay billing: `razorpayClient.ts` (key pair env); rewrite REST layer
      (subscriptions.create→short_url, cancel, customers, plans); HMAC webhook
      handlers (activated/charged→active, halted/payment.failed→past_due,
      cancelled→canceled+grace, completed/expired→expired, authenticated→link);
      `POST /billing/cancel` replaces portal; restore via email lookup; rename
      columns to `razorpay_*`; delete `stripe` + `stripe-replit-sync` deps;
      pricing page ₹/$ toggle. NEEDS (user, test mode): RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET, 4 plan_ids (monthly/yearly × INR/USD), webhook secret
- [ ] D1 Deploy: `express.static(dist/public)` + SPA fallback; lock CORS; Render;
      public URL + real Razorpay webhook URL land here
- [ ] P2 PWA: manifest.json, service worker, install prompt (theme `#163D3B`)
- [ ] P3 Android: capacitor.config; wouter on `capacitor://`; Auth deep links;
      Razorpay short_url in system browser → deep-link back `/app?checkout=success`
- [ ] P4 Electron: main process + electron-builder (.exe/.dmg), same hosted API

## 3b. Polish tracks (post-F4, user-approved — DONE, verified)
- [x] Avatars (2026-09-09): 5 botanical SVGs (leaf default + sun/wave/pebble/
      star); avatar_id column + spec + codegen; onboarding picker; Settings
      "Your look"; sidebar artwork (fallback leaf→initials chain removed with
      initials helper). Fixed settings-save staleness (me.refetch on save).
- [x] History top-3 + expander (2026-09-09): per-day sort by minutes desc,
      top 3 + "Show all N moments"/"Show less", per-day isolated state.
- [x] Top-activities minutes: items `{title, count, minutes}`; rows show minutes;
      trophy keeps count. (Spec + codegen + server aggregate + one-line UI.)
- [x] Animations 2–6 (confetti CUT per user): glider (layoutId pill), route
      slides (AnimatePresence keyed Switch), theme crossfade CSS + shimmer
      skeletons, Tilt on browse + rec cards, timer sub-60s pulse. Each verified
      via its trigger (Tilt transform + timer class measured live in DOM).

## 3c. Fix + delight batch (DONE 2026-09-06, verified)
- [x] Today-blank fix: boundary moved INSIDE keyed motion wrapper; rapid-click
      regression passes (no blanks, correct content every time).
- [x] Affirmations tile live ("A thought for now", 12 quotes, daily rotation).
- [x] Hero particles (CSS drift, verified moving), H1 blur reveal, button
      ripple (verified spawning). NOTE: framer-motion `repeat: Infinity`
      silently stalls in this app — use CSS keyframes for infinite loops.

## 3d. Catalog expansion + friction scoring (DONE, verified)
- [x] 133 seeds: 100 existing (3 additive fields each — byte-verified, 2 Unicode
      lines confirmed correct at byte level) + 33 appended. Badge on both cards.
      Minimal timeOfDay (star-count=night; cloud-watch/mini-picnic=day).
- [x] Scoring +3 friction signals with full-history waiver + suffix normalizer
      (freshness byte-identical). Spec updated (Activity fields + optional hour)
      + codegen. Waivers proven: solo #7 vs #11, materials #8 vs #27, context
      #12 (2am) vs #35 (10am). Badge: 22 rendered, tooltip + aria verified.

## 4. Superseded notes (history — do not re-litigate)
- 200–250 entries → 100 pure seeds (user: duration variants are not "meaningful").
- SQLite → Supabase Postgres (free-host filesystems wipe SQLite).
- Mood-first standalone flow → merged into F1 Browse as mood filter chips.
- Stripe → Razorpay (availability). Stripe-connector code dies with P1.
- STOP point agreed 2026-09-05: build through F4, then pause (P1/D1/P2–P4 later).

## 5. Gotchas (learned from code inspection + build)
- `stripeClient.ts`/`stripeRest.ts` fetch creds from Replit proxy — dead outside Replit.
- `pnpm-workspace.yaml` had linux-only overrides — removed (kept version pins).
- `vite.config.ts` required PORT/BASE_PATH — now defaulted (5173/5174, `/`).
- `custom-fetch.ts` `setBaseUrl`/`setAuthTokenGetter` — reused, don't rebuild.
- Old scoring (pre-F1): mood +8, interest +3 each, duration ≤+5, freshness +2/−4.
- API contract changes require `pnpm --filter @workspace/api-spec run codegen`.
  Never hand-edit generated files.
- Secrets ONLY in git-ignored `.env`; never paste in chat; never commit.
- New Supabase projects sign JWTs with ES256 — server verifies via JWKS
  (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`), HS256 secret is fallback.
  Server REQUIRES real SUPABASE_URL since Phase 3.
- `drizzle.config.ts` must use POSIX relative schema path — absolute Windows
  paths fail with "No schema files found".
- RLS deny-by-default ON both tables, zero policies (verified via pg_class).
- Detached dev servers die if the launching tool call times out — always redirect
  to log files + verify in a separate call. Servers: vite :5173, api :5000.
- Grep/read tools truncate lines at 2000 chars — use Select-String/bash for
  long-line files (missed a sign-out button this way once).
- `pnpm add` re-sorts package.json keys alphabetically — re-read before editing.
- pnpm v11 scaffolds `allowBuilds` placeholders — must set true explicitly.
- One-off node scripts can crash on exit (libuv assert, Windows) AFTER succeeding
  — check output, ignore the crash.
- Root `.env` (server) + `artifacts/reclaim/.env` (VITE_) — both git-ignored.
- Git: real source lives on branch `standalone` at GitHub `origin`
  (`newhere26/Bull-PWA`, public). `origin/main` still holds only an old
  `Reclaim-PWA.zip` dump (8b3a4d1) — push work to `standalone`, never
  force-push `main`. `gitsafe-backup` remote is dead (DNS). No `gh` CLI here;
  `git ls-remote` + webfetch are the way to inspect GitHub.

## 6. Handover protocol (mandatory at session end / before compaction)
1. Record plan changes in THIS file (§2–§4) FIRST, then build.
2. Update track checkboxes (§3) and commit it.
3. Append to `SESSION_LOG.md` (repo root): date, what was done, test results,
   current failing point + error text, exact next step, files touched.
4. State the resume command for the next session (e.g. "continue F1 catalog:
   seeds 1–31 reworked, 69 new pending — see SESSION_LOG 2026-09-05").
5. Never start a new track with a red typecheck; `pnpm run typecheck` is the gate.
6. Browser-verify user-facing changes with Playwright before declaring done.
