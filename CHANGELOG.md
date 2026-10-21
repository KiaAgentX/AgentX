# Changelog

All notable changes to **KIA DropAgentX** are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · SemVer.

## [1.3.0] — Hardened Release (multi-agent audit: 40+ findings fixed)

A full stakeholder/judge audit (security · code quality · data integrity ·
product flows · release packaging) found and this release fixes every critical
and high-severity issue.

### Desktop — standalone Windows installer
- **`DropAgentX-Setup-1.3.0.exe`** (NSIS, per-user, no admin rights needed):
  Next → Next → Finish installs a self-contained XDrop — the Electron shell now
  runs the ENTIRE platform locally (web + bot + cron), not just a client.
- First run bootstraps `%APPDATA%/DropAgentX`: generates a private `.env`
  (32-byte secrets via `crypto.randomBytes`), restores the bundled recovered
  database snapshot, and auto-unlocks the dashboard with the generated key.
- Server runs as an isolated `utilityProcess` with crash-restart backoff and
  log capture to `logs/xdrop.log`; tray menu: Dashboard · Open in Browser ·
  Edit Config (.env) · Data Folder · Logs · Restart Service · Quit.
- Prisma ships a Windows query engine (`binaryTargets += "windows"`); the
  generated client is bundled via an afterPack copy (asar disabled — the
  `.prisma` dot-directory is invisible to the electron-builder collector).
- Linux build host needs no wine: PE icon/version branding is done with
  pure-JS `resedit` (`scripts/eb-afterpack.cjs`) and the NSIS uninstaller stub
  is extracted with the built-in pure-JS reader (`scripts/patch-nsis-nowine.cjs`).

### Security
- **Release artifact scrubbed**: shipped `.env` no longer contains live secrets
  (all placeholders) and the packaged DB is a fresh snapshot; live secrets rotated.
- **`GET /api/v1/products` no longer leaks `deliveryPayload`** — public responses
  use a strict whitelist projection (paid secret content stays server-side).
- **`GET /api/v1/overview` and the SSE stream are key-gated.** The stream now
  requires a short-lived HMAC token (`POST /api/v1/stream-token` → `?token=`)
  because EventSource cannot send headers.
- **Timing-safe `X-KIA-Key` comparison** + per-IP auth-failure lockout (15/min → 429)
  + a 240 req/min per-IP budget across the API.
- **Helmet CSP enabled** (no external scripts); service worker is network-only for
  `/api/` (no authenticated data persisted to disk) with a bounded runtime cache.
- **Kill switch unified**: L02 and the bot panic gate read the same `kill_switch`
  setting; both fail closed when the setting is unreadable.
- **L12 tool-token verification is real** at `executeTool` for calls that carry a
  token (A2A-ready); `MCP_TOKEN_SECRET`/`DASHBOARD_KEY` insecure defaults **fail
  fast in production**; `WEB_CORS_ORIGINS` documented.
- `.dockerignore` added (secrets/DB never baked into image layers); Dockerfile
  runs as non-root with `npm ci` lockfile builds.

### Money integrity
- **`pre_checkout_query` now validates** the order is still payable (status,
  ownership, stock, product active) *before* Telegram charges the buyer — Stars
  can no longer be taken for a dead order; late payments auto-reverse via
  `refundStarPayment` (with owner escalation as fallback).
- **HITL approval resolution is an atomic claim** (`updateMany where status='pending'`)
  + execution nonces on withdrawal/broadcast — a double-tap can never
  double-withdraw or double-broadcast.
- **Stars top-ups are idempotent by durable Nonce claim** (Telegram replays can
  never double-credit); welcome bonus got the same treatment.
- **The credits checkout is one atomic transaction** (reserve stock → create order →
  debit buyer → credit seller → reserve coupon → finalize); the pending-order
  sweeper **recovers paid-but-stuck orders** instead of cancelling them, and
  releases coupon reservations on cancellation.
- **Coupons claim atomically inside the checkout transaction** (max-uses is
  race-proof); refunds disclose the credits-refund policy for Stars orders
  (localized).

### Product / UX
- **Seller dead-end fixed**: `/sales` history rows now open a full seller view of
  the order (buyer name + deliver action) instead of an error.
- **Notifications hardened**: 3× retry with backoff, "⏳ N awaiting delivery"
  banner in `/sales` and on every staff `/start`.
- **Confirmations everywhere**: credits purchase, P2P transfer, and the kill
  switch all require an explicit second tap.
- **Full i18n parity**: ar/ru received all 44 missing keys; 18 new keys in all 4
  locales; money notifications (top-up, withdrawal, refund, referral, quest) are
  now localized; `welcome` message uses the live brand name (no stray asterisks).
- Booking reminders fire **1 hour** before (not 60h), localized; cron jobs have
  overlap guards and honor `REPORT_TZ`; long-polling reconnects with backoff.

### Data integrity
- **Ledger reconciled**: 10 legacy-drifted wallets aligned (Σ ledger == Σ balances,
  both 187,925) with auditable `reconciled` note rows; `scripts/reconcile-ledger.ts`
  ships for re-verification.
- **`npm run backup` fixed for every layout** (Prisma-relative path resolution,
  no `node:sqlite` → works on Node ≥ 20) + existence checks; CI smoke-tests it.
- **Silent empty-DB boot detected** (loud warning); DB filename unified to
  `db/custom.db` across config/.env.example/Dockerfile/README; `npm run seed`
  refuses to seed a restored database without `--force`.
- `/healthz` reports the real version from package.json; `GET /quests` is
  read-only (defaults seeded once at boot, create-only).

### Packaging
- CI: fixed trigger branches, plain `npm ci`, key-gated smoke tests (401 +
  payload-leak assertions), backup smoke step. Dependabot enabled. `bun.lock`
  and dual-lockfile drift removed. Version → 1.3.0.


## [1.2.0] — Aurora Release

### Added
- **Aurora design system** for the PWA dashboard: glassmorphism cards, aurora
  gradient backdrop, gradient KPIs, bottom-nav on mobile, full RTL via logical
  properties, light/dark themes, shimmer skeletons, reduced-motion support.
- **Self-hosted Vazirmatn font** (`public/fonts/`, preloaded) — Persian/Arabic
  renders identically everywhere, zero third-party requests.
- **Screenshot gallery** (`docs/screenshots/`, 29 real captures): desktop + mobile,
  dark + light, owner + guest/locked states, Persian RTL — see the platform
  before you run it.
- **`npm run backup`** — online-safe SQLite snapshots via `VACUUM INTO`
  (no downtime), retention policy (`--keep N`, default 30), custom `--out` dir.
- **`docker-compose.yml`** — one-command stack with a named volume so data
  survives rebuilds; built-in healthcheck.

### Fixed
- Quests view API-contract mismatch (flat vs nested items) — dashboard quests
  now render correctly.
- Global `[hidden]` attribute was overridden by `.btn` display — hidden stays hidden.
- Light theme not applying without reload; topbar brand truncation on mobile.
- Localized chart x-labels to Persian/Arabic digits; localized remaining
  hardcoded hints (overview, CRM funnel, settings).
- Default quest catalog re-seeded English titles on every boot — now localized
  and stable.

## [1.1.0] — Engineering Pass + Best-of-Merge

### Changed — architecture restructured
- Layered layout with a strict dependency direction:
  `src/core` (platform primitives: db · bus · logger · crypto · ids · errors · json) →
  `src/security` (15 fail-closed layers, promoted out of `core/security`) →
  `src/services` (domain: + `hitl.service`, `settings.service` moved in) →
  adapters (`bot`, `web`, `mcp`, `cron`) → `index.ts` composition root.

### Added
- **Lead CRM** (`new → warm → won`, revive `lost → warm`): Prisma `Lead` model,
  `crm.service` with validated pipeline transitions + normalized-contact dedupe,
  REST `/api/v1/leads*` (owner-keyed), dashboard CRM view (KPIs, stage tabs,
  one-tap stage moves, JSON import), bot `/crm` + `/lead` + `.json` document import.
- **White-label branding**: `BRAND_NAME` / `BRAND_TAGLINE` / `BRAND_FOOTER` env,
  live overrides via `brand_*` settings, public `GET /api/v1/brand`,
  PWA self-rebranding at boot.
- **Test suite** (`tests/`, node:test via tsx): crypto primitives, security
  layers (rate-limiter, redaction, prompt-guard, MCP tokens fail-closed),
  CRM pipeline rules, contact normalization, i18n fallback/detection.
- **CI hardening**: fixed `branches` typo, test + secret-scan stages, brand
  endpoint in the boot smoke test; typecheck now covers tests too.
- **Sales kit** (`docs/sales/`): Day-1 Sales Kit, War Machine outreach loop,
  ZENOVIX upsell ladder, Brand Kit — plus a Railway deploy button in the README.

### Fixed (found by the new tests)
- `isValidContact` rejected valid **email** contacts — emails were impossible to add.
- Redaction scrubbed API keys but **not Telegram bot tokens** — added a dedicated rule.

## [1.0.0] — Ultimate Edition

### Added
- **AI Agent Crew**: orchestrator + receptionist, sales, support, analyst, content —
  RAG-grounded, 25 languages, deterministic fallback when AI is offline.
- **Marketplace & money**: dual-currency products (Stars + credits), escrow order
  lifecycle, coupons, reviews, stock reservation, commissions.
- **Wallet**: deposits, transfers, HITL-gated withdrawals, transaction history.
- **Engagement**: quests & XP with streaks, referrals, leaderboards, bookings with
  reminders, welcome bonuses.
- **Governance**: HITL approval queue (risk levels, TTL fail-closed expiry), kill switch,
  full audit log.
- **Security**: 15-layer fail-closed pipeline (whitelist, rate limit, RBAC, prompt
  injection, webhook signature, anti-replay, spend quota, tool tokens, redaction,
  idempotency, audit).
- **MCP tool layer**: signed fail-closed tokens, A2A JSON-RPC endpoint, approval→execution hook.
- **Clients**: Telegram super-app bot (grammY), realtime PWA dashboard (SSE), Electron
  desktop shell with tray.
- **Ops**: one-command Railway deploy (nixpacks + railway.json + healthcheck), Dockerfile,
  seed script, cron jobs (reminders, sweeper, daily reports, radar).
