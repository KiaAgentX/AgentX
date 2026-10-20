# Changelog

All notable changes to **KIA DropAgentX** are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · SemVer.

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
