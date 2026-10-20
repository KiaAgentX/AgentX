# Security — KIA DropAgentX

## Model

**Fail-closed by default.** If a control can't decide, the answer is *no*.
All 15 layers live in `src/core/security/` and run in fixed order; the first `block`
short-circuits the request and writes an `AuditLog` row.

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
