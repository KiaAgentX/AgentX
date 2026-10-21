# Security — KIA DropAgentX

## Model

**Fail-closed by default.** If a control can't decide, the answer is *no*.
All 15 layers live in `src/security/layers.ts` and run in fixed order; the first `block`
short-circuits the request and writes an `AuditLog` row.

**Honesty note (enforced vs declarative):** most layers are *enforced* at a real
boundary in this codebase (L01–L06, L08–L11, L14–L15). Three are *declarative*
controls: L07 (schema checks happen per-tool in `mcp/execute.ts` and zod config
validation, not through a generic Zod schema table), L12 (tool tokens are minted
and verified at `executeTool` whenever a call carries one — internal agent calls
omit the token by design; external/A2A callers MUST present one) and L13
(redaction is applied by agents before output reaches users, not at a single
choke point). We label them clearly instead of overclaiming.

| Layer | Name | Blocks |
|---|---|---|
| L01 | Whitelist Gate | non-whitelisted users (when `WHITELIST_ONLY=true`) |
| L02 | Kill Switch | everything while enabled (`/kill on`, runtime setting) |
| L03 | Rate Limit | per-user floods (`RATE_LIMIT_PER_MIN`) |
| L04 | RBAC | role escalation & staff-only tools from user accounts |
| L05 | Input Sanitize | malformed / oversized input |
| L06 | Prompt Injection | instruction-smuggling aimed at the AI crew |
| L07 | Schema Validation | type-confused tool arguments |
| L08 | Webhook Signature | forged Telegram webhooks (`X-Telegram-Bot-Api-Secret-Token`) |
| L09 | Anti-Replay | duplicate / resent deliveries |
| L10 | Spend Quota | daily spend beyond `DAILY_SPEND_LIMIT` (non-staff) |
| L11 | HITL Gate | money & irreversible actions without human approval |
| L12 | Fail-Closed Tool Token | unsigned / expired MCP tool tokens |
| L13 | Output Redaction | secrets in AI/tool output reaching users |
| L14 | Idempotency | double-spend via replayed operations |
| L15 | Audit Trail | — (records every decision) |

## HITL (Human-in-the-Loop)

High-risk tools (`withdraw`, `refund`, `broadcast`, spend over quota) never execute
directly. They create an `Approval` with risk level + payload + TTL
(`APPROVAL_TTL_MIN`). Only `OWNER_IDS`/`ADMIN_IDS` can decide. On approval the
`mcp/approval-hook` **re-validates and executes**; on expiry a cron sweeper auto-rejects
(fail-closed). All transitions are audited.

## Secrets

- All config flows through `src/config.ts` (zod-validated). Never read `process.env`
  elsewhere.
- `.env` is git-ignored; `.env.example` documents every variable.
- Telegram webhook calls must carry the shared secret header (L08) — otherwise 401.
- Dashboard owner APIs require `X-KIA-Key` (`DASHBOARD_KEY`, falling back to
  `MCP_TOKEN_SECRET`).

## Web API & dashboard security

- `X-KIA-Key` comparisons are **timing-safe**; repeated failures per IP are rate-limited
  (15/min → 429) and the whole API surface has a 240 req/min per-IP budget.
- Owner endpoints (`/overview`, `/orders`, `/wallets`, `/settings`, …) are **key-gated**.
  Only `/brand`, the product catalog (sanitized projection — never `deliveryPayload`)
  and `/quests`+`/leaderboard` are public.
- The SSE live stream (`/api/v1/stream`) is **key-gated via short-lived HMAC tokens**
  (5-min TTL): the dashboard exchanges its key at `POST /api/v1/stream-token`, then
  connects with `?token=…` (EventSource cannot send headers).
- The PWA is served behind Helmet CSP (no external scripts), and the service worker
  persists **no** authenticated API responses to disk (network-only for `/api/`).
- Known single-tenant caveat: the dashboard key both requests and approves HITL
  actions; bot-originated approvals are separated by design. For a multi-admin
  deployment, scope per-operator keys before enabling broad staff access.

## Reporting a vulnerability

1. **Do not** open a public GitHub issue.
2. Email the owner contact or use GitHub's *Security → Report a vulnerability* (private).
3. Include reproduction steps and impact. You'll get an acknowledgement within 72h and
   a fix timeline within 7 days. Credit is given in the CHANGELOG if desired.

## Operational hardening checklist

- [ ] `MCP_TOKEN_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `DASHBOARD_KEY` all randomized (32 hex)
- [ ] `OWNER_IDS` contains only your personal Telegram ID
- [ ] Volume mounted (Railway `/app/db`) so data persists
- [ ] `WHITELIST_ONLY=true` while onboarding / private beta
- [ ] Review `/api/v1/security` audit tail in the dashboard weekly
