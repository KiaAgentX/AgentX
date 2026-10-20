# Architecture — KIA DropAgentX

## Boot sequence (`src/index.ts`)

```
connectDb → registerMcpApprovalHook → createWebServer(bot) → startCron → startBot
```

- **Web-only mode**: no `BOT_TOKEN` → dashboard + API still run (Railway healthcheck passes).
- **Full mode**: bot boots with webhook (when `PUBLIC_URL` is set) or long-polling (dev).

## Layers

| Layer | Folder | Responsibility |
|---|---|---|
| Clients | `src/bot`, `public/`, `desktop/` | Telegram (grammY), PWA dashboard (vanilla JS + SSE), Electron shell |
| HTTP | `src/web` | Express: REST `/api/v1`, SSE `/api/v1/stream`, static dashboard, Telegram webhook |
| Intelligence | `src/agents` | Orchestrator (security gate → intent routing) + 6 specialists |
| Security | `src/security` | 15-layer fail-closed pipeline, prompt-guard, redaction, RBAC, quotas, tokens |
| Tools | `src/mcp` | MCP-style tool registry with signed fail-closed tokens; approval→execution hook |
| Governance | `src/services/hitl.service.ts` | Approval queue: create/list/resolve/expire, risk levels, TTL |
| Domain | `src/services` | wallet · marketplace · orders · coupons · quests · referrals · leaderboard · analytics · bookings · notifications · **lead CRM** |
| Data | `prisma` + `db/` | 18 models on SQLite (Prisma) |
| Platform | `src/ai`, `src/rag`, `src/i18n`, `src/cron`, `src/core` | AI adapter, knowledge base, 25 locales, scheduled jobs, event bus |

## Event bus (`src/core/bus.ts`)

Services **never** call Telegram directly. They emit typed events:

```
wallet_tx · order_new · order_paid · order_delivered · order_cancelled ·
quest_progress · quest_completed · quest_claimed · level_up ·
notify_owner · approval_created · approval_resolved · sse
```

Subscribers: **bot** (sends DMs), **web** (SSE fan-out to dashboard), **cron**,
**mcp/approval-hook** (executes side-effects when an approval is resolved).

## HITL flow (money & irreversible actions)

```
tool call (withdraw/refund/broadcast/spend over quota)
  → L11 HITL Gate → Approval created (risk, payload, TTL)
  → owner notified (bot) + dashboard queue
  → approve/reject within TTL
  → approval_resolved event → mcp/approval-hook executes
     (re-validates everything; fail-closed on any doubt)
  → TTL expiry → auto-reject (sweeper in cron)
```

## AI strategy

`src/ai/provider.ts` talks to any OpenAI-compatible API. When the AI is unreachable,
every agent has a deterministic fallback (keyword routing, catalog lookups, KB search),
so the product never hard-fails. All outputs pass through L13 redaction.

## Money rules

Integers only. Credits and Stars are separate ledgers. Commission is computed once at
order creation. Stock is reserved at order time and released on cancel/refund.
Double-claim protection via atomic conditional updates + `Nonce` table.
