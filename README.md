<div align="center">

# 🐘 KIAdropAgentX — DropAgentX Ultimate

**The all-in-one Telegram marketplace bot + white-label sales engine + lead CRM.**

*One deploy. Bot, web app, desktop PWA — and a full £150 → £29/mo revenue pipeline built in.*

[![Version](https://img.shields.io/badge/version-5.0.0—Ultimate-8a2be2)](CHANGELOG-v5.0.0.md)
[![Python](https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white)](requirements.txt)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Railway](https://img.shields.io/badge/deploy-Railway-0B0D0E?logo=railway&logoColor=white)](docs/DEPLOY-GITHUB-RAILWAY.md)
[![Tests](https://img.shields.io/badge/tests-110%2B%20-green)](#-testing--ci)
[![CI](https://github.com/KiaAgentX/DropAgentX/actions/workflows/ci.yml/badge.svg)](https://github.com/KiaAgentX/DropAgentX/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**[Quick Start](#-quick-start)** · **[Deploy on Railway](#-deploy-on-railway--github)** ·
**[Features](#-features)** · **[Architecture](#-architecture)** ·
**[Sales Engine](#-sales-engine--the-built-in-revenue-loop)** ·
**[فارسی](#-راهنمای-فارسی)**

[![Deploy on Railway](https://railway.com/button)](https://railway.com/new/template?template=https://github.com/KiaAgentX/DropAgentX)

<img src="web/app/assets/logo.jpg" width="120" alt="DropAgentX logo" />

</div>

---

## 📖 Table of Contents

- [Why this repo](#-why-this-repo)
- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Deploy on Railway + GitHub](#-deploy-on-railway--github)
- [Configuration](#%EF%B8%8F-configuration)
- [Sales Engine — the built-in revenue loop](#-sales-engine--the-built-in-revenue-loop)
- [Web · Bot · Desktop](#-web--bot--desktop)
- [API Overview](#-api-overview)
- [Testing & CI](#-testing--ci)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)
- [راهنمای فارسی](#-راهنمای-فارسی)

---

## 🎯 Why this repo?

| You get | Detail |
|---|---|
| **Sell in 48 hours** | White-label demo store rebrandable with **one env variable** (`BRAND_NAME`) |
| **A CRM, not just a bot** | Import scraped leads, dedupe, move them through `new → warm → won` |
| **Three surfaces, one codebase** | Telegram bot · responsive web app · installable desktop/mobile PWA |
| **One-click deploy** | Dockerfile + `railway.json` + healthcheck, push-to-deploy from GitHub |
| **Production hardening** | Structured logs, rate limits, backup/restore, secret redaction, CI gates |
| **Zero external services to start** | SQLite file + optional OpenRouter key; add Postgres-scale infra later |

---

## ✨ Features

### 🤖 Telegram Bot (aiogram 3)
- Marketplace: products, media uploads, orders, moderation, categories
- Economy: credits, daily bonus streaks, referral system, commission, USDT wallet
- Tasks & quests, leaderboard, support tickets, org/team tools
- **AI chat** with skills library (built-in skill packs) + Hermes engine
  (local CLI / gateway / OpenAI-compatible fallback)
- Growth tools: broadcast, launch bonuses, anti-fraud filter
- Full **fa/en** localization (Vazirmatn, self-hosted)

### 🌐 Web App (FastAPI + PWA)
- Public storefront, product pages, search, glassmorphism links hub (`/links`)
- **3D showcase** (Three.js), live SSE dashboard (`/insights`), analytics
- Admin panel (`/admin`): moderation, finance, users, broadcast, backups
- **Lead CRM (`/crm`)**: JSON import, dedupe, stage pipeline, search
- Service worker + manifest → installable on **Android, iOS, desktop**
- `GET /healthz` for Railway healthchecks

### 🤝 Sales Engine (white-label demo machine)
- `BRAND_NAME` / `BRAND_TAGLINE` / `BRAND_FOOTER` → whole instance rebrands in 5s
- `tools_seed_prospect.py` — 4 business presets (`restaurant/cafe/gym/salon`),
  menu seeded in 30s, `--wipe` between demos
- `tools_validate_leads.py` — contract validation for lead JSON before import
- Playbooks included: [War Machine](docs/sales/WAR-MACHINE.md) (3-channel outreach +
  £150 closer), [Day-1 Sales Kit](DAY1-SALES-KIT.md), [Zenovix upsell](docs/sales/ZENOVIX-UPSELL.md)
  (£29/mo), [Hermes Miner missions](docs/missions/HERMES-MINER.md)

### 🛡 Ops & Security
- Structured JSON logs to stdout (Railway-friendly) + rotating file logs
- SQLite single-file DB with VACUUM/archival schedules, backup & restore endpoints
- Upload hardening (path traversal, size caps), SSRF guards, fail-closed secrets
- Origin-checked admin POSTs (CSRF) + signed HttpOnly cookies
- CI: `compileall` + `ruff` + **secret scan** + `pytest` on every push

---

## 🏗 Architecture

```
                    ┌──────────────────────────────────────────────┐
   Telegram ───────►│  bot.py (aiogram)                            │
                    │   └─ handlers/*  market·wallet·AI·CRM·admin  │
   Browser  ───────►│  web_admin.build_app() (FastAPI + static)    │
   PWA/TWA  ───────►│   └─ /admin  /crm  /links  /insights  /healthz│
                    │                                              │
   Hermes   ───────►│  prospects.py  (import · dedupe · stages)    │
   (scrape)  JSON   │  hermes_engine.py (CLI/gateway/API fallback) │
                    └───────────────┬──────────────────────────────┘
                                    │
                    database.py ────┴──► SQLite (aiosqlite, one file)
                                    │
                    Railway: Dockerfile → railway.json → /healthz
```

*Design rules: single process (bot + web in one service), single database file,
horizontal scale comes later from the same codebase — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).*

---

## 🚀 Quick Start

### 1. Local

```bash
git clone https://github.com/KiaAgentX/DropAgentX.git
cd DropAgentX

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # Windows: copy .env.example .env
# minimal: BOT_TOKEN=...   ADMIN_IDS=123456789   WEB_PASSWORD=...

python run.py
```

- Bot only: leave `WEB_PORT` empty · Bot + web: `WEB_PORT=8080` → http://localhost:8080

### 2. Docker

```bash
docker build -t kiadropagentx .
docker run -p 8080:8080 --env-file .env -v dax-data:/app/data kiadropagentx
```

### 3. Dev tools

```bash
pip install -r requirements-dev.txt
ruff check .          # lint
pytest                # 110+ tests
python tools_validate_leads.py leads.json --out leads.clean.json
```

---

## 🚂 Deploy on Railway + GitHub

Full walkthrough: **[docs/DEPLOY-GITHUB-RAILWAY.md](docs/DEPLOY-GITHUB-RAILWAY.md)**

```bash
git init && git add . && git commit -m "DropAgentX Ultimate v5.0.0"
git branch -M main
git remote add origin https://github.com/KiaAgentX/DropAgentX.git
git push -u origin main
```

1. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → pick `DropAgentX`
2. Variables (minimum): `BOT_TOKEN` · `ADMIN_IDS` · `WEB_PASSWORD` · `WEB_SECRET` · `COOKIE_SECURE=1`
3. Add a **Volume** and set `DATA_DIR=/data` so the DB survives redeploys
4. Save → automatic build (Docker) → `https://<app>.up.railway.app/healthz` must answer `{"ok": true, "version": "5.0.0"}`
5. Every `git push` to `main` redeploys; Actions runs tests first

---

## ⚙️ Configuration

Copy `.env.example` → `.env`. Full reference: [`config.py`](config.py).

| Key | Required | Purpose |
|---|---|---|
| `BOT_TOKEN` | ✅ | Telegram bot token (@BotFather) |
| `ADMIN_IDS` | ✅ | Comma-separated numeric admin IDs |
| `WEB_PASSWORD` / `WEB_SECRET` | ✅ web | Admin panel login + cookie signing key |
| `COOKIE_SECURE` | ✅ prod | `1` behind TLS |
| `CRM_TOKEN` | optional | Header `x-crm-token` for scripted lead import |
| `WEB_PORT` | local | Port for bot+web in one process (Railway injects `PORT`) |
| `DATA_DIR` | Railway | Mount point of the Volume → DB/uploads/backups |
| `BRAND_NAME` / `BRAND_TAGLINE` / `BRAND_FOOTER` | demo | White-label rebrand |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | optional | AI chat (OpenRouter by default) |
| `HERMES_MODE` | optional | `auto` · `local` · `gateway` · `api` |
| `FILE_STORAGE_CHANNEL_ID` | scale | Store product files as Telegram `file_id` (0 bytes on volume) |

---

## 💰 Sales Engine — the built-in revenue loop

```
Hermes mines leads ──► POST /api/hermes/import (dedupe business+city)
        │                        │
        │                 🤝 /crm dashboard
        ▼                        ▼
  3-channel drafts ──► manual send ──► stage: warm
   (IG · email · WA)                  │
                                      ▼
                     live white-label demo (BRAND_*)
                                      │
                                      ▼
                        close £150 / 48h / pay-after-demo
                                      │
                                      ▼
                  upsell £29/mo smart reception (Zenovix)  → MRR
```

- **The machine drafts, humans send.** No auto-spam, no fake reviews —
  red lines are documented in [docs/sales/WAR-MACHINE.md](docs/sales/WAR-MACHINE.md)
- KPIs: ≥10 fresh leads/day · ≥3 replies/day · ≥1 demo/day · ≥1 close / 3 days

---

## 📱 Web · Bot · Desktop

| Surface | Entry | Notes |
|---|---|---|
| Storefront | `/` | PWA, offline caching, RTL, mobile-first |
| Admin | `/admin` | glass UI, backups, broadcast, moderation |
| Lead CRM | `/crm` | import · stages · search (admin only) |
| Bot | Telegram | fa/en menus, inline keyboards, Mini App buttons |
| Desktop | Install PWA from Edge/Chrome | see [docs/DESKTOP.md](docs/DESKTOP.md) |
| Android APK | PWABuilder (TWA) | documented in the same guide |

---

## 🔌 API Overview

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /healthz` | public | version + ok (Railway healthcheck) |
| `POST /api/login` | rate-limited | admin session cookie |
| `GET /api/prospects?stage=&q=` | admin cookie / `x-crm-token` | lead list + stats |
| `POST /api/hermes/import` | admin cookie / `x-crm-token` | import leads (`[...]` or `{"items":[...]}`) |
| `POST /api/prospects/{id}/stage` | admin cookie / `x-crm-token` | move lead through pipeline |
| `POST /api/app/*` | mini-app token | mobile app surface (feed, buy, wallet, agent) |
| `GET /api/admin/*` | admin cookie | stats, finance, logs, backup, export, broadcast |

```bash
curl -X POST https://<app>.up.railway.app/api/hermes/import \
  -H "x-crm-token: $CRM_TOKEN" -H "Content-Type: application/json" \
  --data @leads.json
# → {"ok":true,"created":8,"duplicates":2,"skipped":0,"errors":[]}
```

---

## 🧪 Testing & CI

```bash
pip install -r requirements-dev.txt
pytest              # unit + integration (isolated tmp DB per test)
ruff check .
```

CI (`.github/workflows/ci.yml`) runs on every push/PR:
`compileall` → `ruff` → **secret scan** → `pytest`.
See [docs/RELEASE-HISTORY.md](docs/RELEASE-HISTORY.md) for the full changelog trail
(0.5.x → 1.0 → 2.1 «Day-1» → 4.2 «full-web» → **5.0 Ultimate**).

---

## 📂 Project Structure

```
KIAdropAgentX/
├── run.py                    # launcher: Railway PORT → WEB_PORT, mode banner
├── bot.py                    # aiogram entry (bot + in-process web)
├── web_admin.py              # FastAPI: pages, admin API, CRM API, static
├── config.py                 # all env keys, VERSION, white-label
├── database.py               # aiosqlite layer, migrations, backup/restore
├── prospects.py              # ★ War Machine CRM: import · dedupe · stages
├── handlers/                 # bot routers (market, wallet, AI, crm, admin…)
├── hermes_engine.py          # external agent: CLI / gateway / API
├── tools_seed_prospect.py    # 4 business presets → live demo in 30s
├── tools_validate_leads.py   # ★ lead JSON contract validator (CLI)
├── web/                      # PWA: storefront, admin, insights, /crm UI
├── docs/
│   ├── sales/                # WAR-MACHINE · ZENOVIX-UPSELL
│   ├── missions/             # HERMES-MINER
│   ├── DEPLOY-GITHUB-RAILWAY.md · DESKTOP.md · ARCHITECTURE.md
│   └── RELEASE-HISTORY.md
├── tests/                    # 110+ tests (incl. test_v500.py)
├── .github/workflows/ci.yml  # lint · secrets · tests
├── Dockerfile · railway.json · Procfile
└── .env.example
```

---

## 🗺 Roadmap

- [x] v5.0 — Lead CRM in-repo, KIA playbooks, GitHub+Railway CI pipeline
- [ ] v5.1 — Demo rotation manager (multi-prospect `BRAND_*` presets, one click)
- [ ] v5.2 — Lead scoring + auto-draft outreach (send stays manual)
- [ ] v5.3 — Zenovix bridge: upsell button straight from a `won` deal
- [ ] v5.4 — Multi-tenant mode (one DB per client, provision script)

---

## 🤲 Contributing

1. Fork → feature branch → `ruff check . && pytest`
2. Keep the red lines: **no auto-send, no fake reviews, human-in-the-loop pricing**
3. Open a PR with a short “why”

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## 🔒 Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
Never commit `.env`; it is git-ignored, and CI fails on credential-looking strings.

---

## 📜 License

[MIT](LICENSE) © DropAgentX / KIA contributors.

---

## 🇮🇷 راهنمای فارسی

**سریع‌شروع:**
1. `pip install -r requirements.txt` سپس `.env.example` را به `.env` کپی کن
   (`BOT_TOKEN` + `ADMIN_IDS` کافی است) → `python run.py`
2. **دپلوی:** [docs/DEPLOY-GITHUB-RAILWAY.md](docs/DEPLOY-GITHUB-RAILWAY.md) —
   آپلود روی گیت‌هاب → اتصال Railway → Volume + متغیرها → دپلوی خودکار با push
3. **دموی زنده برای پروسپکت:** [DAY1-SALES-KIT.md](DAY1-SALES-KIT.md) —
   `BRAND_NAME` را نام مشتری بگذار + Restart
4. **لیدها:** پنل ادمین → 🤝 CRM لیدها (`/crm`) — ایمپورت JSON هرمس، استیج warm/won
5. **کیت‌های فروش:** [جنگ](docs/sales/WAR-MACHINE.md) ·
   [آپ‌سِل £۲۹](docs/sales/ZENOVIX-UPSELL.md) · [مأموریت معدن](docs/missions/HERMES-MINER.md)

**خطوط قرمز:** AI فقط پیش‌نویس می‌نویسد — ارسال، تصمیم و پول با انسان است.

<div align="center">

**⭐ If this saves you a week of work, star the repo — it keeps the roadmap moving.**

</div>
