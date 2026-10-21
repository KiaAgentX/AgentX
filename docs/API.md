# KIA DropAgentX — HTTP API Contract (v1)

Single source of truth for the **web server** (`src/web/server.ts`) and the
**dashboard** (`public/`). Both sides MUST implement/consume exactly this shape.

- Base URL: `/api/v1`
- Every response is JSON: `{ "ok": true, "data": … }` or `{ "ok": false, "error": "code" }`
- Auth: endpoints marked 🔒 require the header `X-KIA-Key: <DASHBOARD_KEY>`
  (`config.web.dashboardKey`). Wrong/missing key → `401 {ok:false,error:"unauthorized"}`.
- Unknown routes → `404 {ok:false,error:"not_found"}`. Handler errors → `500 {ok:false,error:"internal"}`.

## System

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/healthz` | – | `{status:"ok", uptime, db, bot, ai, version, brand}` |
| GET | `/api/v1/brand` | – | White-label identity `{name, tagline, footer}` (env → live settings) |
| GET | `/api/v1/overview` | 🔒 | KPI block + series + `brand` (see below) — owner data |
| POST | `/api/v1/stream-token` | 🔒 | mints a 5-min HMAC token for the SSE stream |
| GET | `/api/v1/stream?token=…` | token | SSE: emits bus events (`wallet_tx`, `order_new`, `order_paid`, `order_delivered`, `quest_completed`, `level_up`, `approval_*`, `notify_owner`, `sse`) as `data: {"type":…, "payload":…}` |

### GET /api/v1/overview → data
```jsonc
{
  "users": 128, "products": 34, "orders": 210,
  "revenueStars": 5400, "revenueCredits": 120000,
  "pendingApprovals": 2, "aiCalls": 57,          // last 24h
  "series": [ { "date": "2025-01-01", "orders": 12, "revenue": 340 } ],  // last 14 days, UTC
  "topProducts": [ { "id": "…", "title": "…", "salesCount": 21 } ],      // top 5
  "recentOrders": [ { "id": "…", "title": "…", "totalStars": 120, "totalCredits": 0, "status": "paid", "createdAt": "ISO", "buyer": "name" } ]  // last 8
}
```

## Marketplace

| Method | Path | Auth | Body / Query | Data |
|---|---|---|---|---|
| GET | `/api/v1/products` | – | `?q=&category=&limit=&offset=` | `{items: Product[], total}` |
| POST | `/api/v1/products` | 🔒 | `{title, description?, category?, priceStars, priceCredits?, stock, featured?}` | `{item: Product}` |
| PATCH | `/api/v1/products/:id` | 🔒 | partial same fields + `active?` | `{item}` |
| DELETE | `/api/v1/products/:id` | 🔒 | – | `{item}` (archive) |

## Orders, Wallet, Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/orders?status=&limit=&offset=` | 🔒 | `{items, total}` (product + buyer name included) |
| POST | `/api/v1/orders/:id/status` | 🔒 | `{action: "deliver"\|"cancel"\|"refund"}` — refund goes through HITL |
| GET | `/api/v1/wallets?limit=` | 🔒 | `{items:[{userId,name,username,role,balance,locked,credits}]}` top by balance |
| GET | `/api/v1/users?limit=` | 🔒 | `{items:[{id,name,username,role,language,createdAt}]}` |

## Engagement

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/quests` | – | `{items: QuestView[]}` (current period) |
| GET | `/api/v1/leaderboard?type=xp\|sales\|ref&limit=` | – | `{items:[{rank,name,xp\|sales\|refs}]}` |
| GET | `/api/v1/bookings?limit=` | 🔒 | `{items}` upcoming first |
| GET | `/api/v1/radar` | 🔒 | `{items: RadarFinding[]}` (latest 50) |

## Lead CRM (owner)

Pipeline: `new → warm → won` (+ `lost`, revive `lost → warm`). `contact` is the
normalized dedupe key (email / `+phone` / `@handle`) — duplicates are skipped, never fatal.

| Method | Path | Auth | Body / Query | Data |
|---|---|---|---|---|
| GET | `/api/v1/leads?stage=&q=&limit=&offset=` | 🔒 | `q` matches contact/name/company | `{items: Lead[], total}` |
| GET | `/api/v1/leads/stats` | 🔒 | – | `{total, byStage{new,warm,won,lost}, wonRate, fresh24h}` |
| POST | `/api/v1/leads` | 🔒 | `{contact, name?, company?, stage?, score?, tags?, notes?}` | `{item, created}` |
| POST | `/api/v1/leads/import` | 🔒 | `{rows: Row[] \| Row, source?}` (≤ 2000 rows) | `{imported, skipped, invalid[{index,error}], source}` |
| POST | `/api/v1/leads/:id/stage` | 🔒 | `{stage, note?}` — validated transition | `{item}` |

SSE events: `lead_new`, `lead_stage`. Bot shortcuts: `/crm`, `/lead <contact> [name]`,
and a `.json` document upload from a staff chat performs a bulk import.

## Owner — Governance & Ops

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/v1/approvals?status=pending` | 🔒 | – | `{items: PendingApprovalView[]}` |
| POST | `/api/v1/approvals/:id/decide` | 🔒 | `{approve: boolean, note?}` | resolves + executes side-effect; `{item}` after |
| GET | `/api/v1/settings` | 🔒 | – | `{items: Setting[]}` |
| PUT | `/api/v1/settings` | 🔒 | `{key, value}` | upsert |
| POST | `/api/v1/broadcast` | 🔒 | `{text}` | creates HITL approval `broadcast` → `{item: Approval}` |
| GET | `/api/v1/security` | 🔒 | – | `{layers: SECURITY_LAYERS_DOC, audit: AuditLog[]}` (last 100) |

## Telegram webhook (mounted by web server)

`POST /webhook/telegram` — verifies `X-Telegram-Bot-Api-Secret-Token` against
`config.bot.webhookSecret` (401 otherwise), then delegates to `bot.handleUpdate(req.body, res)`.
Always answers `200` fast on success; invalid body → `400`.
