# Deployment Guide — KIA DropAgentX

One service, one database, three clients. Pick your path:

| Path | Difficulty | Best for |
|---|---|---|
| **Railway (recommended)** | ⭐ 5 min | everyone — GitHub auto-deploy + volume |
| Docker | ⭐⭐ | any VPS |
| Bare Node | ⭐⭐ | local / dedicated servers |

---

## 1) Railway (GitHub → Production)

### Step 1 — Push the repo to GitHub
```bash
git init
git add -A
git commit -m "🚀 KIA DropAgentX Ultimate"
git branch -M main
git remote add origin https://github.com/<you>/KIAdropagentx.git
git push -u origin main
```

### Step 2 — Create the project
1. [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → select `KIAdropagentx`
3. Railway detects Nixpacks automatically: `npm install → prisma generate → npm run build`
   and starts with `npx prisma db push --skip-generate && node dist/index.js`
   (defined in `railway.json` / `nixpacks.toml` — nothing to configure).

### Step 3 — Persistent volume (SQLite)
- Service → **Storage** → **Create Volume**
- **Mount path: `/app/db`**
- Your SQLite file lives at `/app/db/custom.db` and survives every deploy.

### Step 4 — Variables (service → Variables)
```env
NODE_ENV=production
OWNER_IDS=<your-telegram-id>
MCP_TOKEN_SECRET=<run: openssl rand -hex 32>
TELEGRAM_WEBHOOK_SECRET=<run: openssl rand -hex 32>
DASHBOARD_KEY=<run: openssl rand -hex 24>
BOT_TOKEN=<BotFather token>
BOT_USERNAME=<yourbot>
# PUBLIC_URL — add AFTER you have your domain (step 5)
```
> Without `BOT_TOKEN` the service still boots (web-only mode) — useful for a first green deploy.

### Step 5 — Domain & webhook
1. **Settings → Networking → Generate Domain** → e.g. `https://kiadropagentx-production.up.railway.app`
2. Add variable `PUBLIC_URL=https://…up.railway.app` → **Redeploy**
3. On boot the bot calls `setWebhook` automatically; verify in logs:
   `✅ webhook registered`
4. Healthcheck endpoint: `GET /healthz` (already wired in `railway.json`).

### Step 6 — Verify
- Open `https://…/healthz` → `{"status":"ok", …}`
- Open `https://…/` → dashboard
- Telegram → your bot → `/start` → welcome menu
- As owner: `/panel` → stats · `/approvals` → queue

### Updating
`git push` → Railway rebuilds and redeploys automatically. Prisma schema changes are
applied on boot (`prisma db push`) — always backwards-compatible with the volume data.

---

## 2) Docker (VPS)

```bash
docker build -t kiadropagentx .
docker run -d --name kia \
  -p 3000:3000 \
  -v $(pwd)/db:/app/db \
  --env-file .env \
  --restart unless-stopped \
  kiadropagentx
```
Set `PUBLIC_URL=https://your-domain` behind an HTTPS reverse proxy (Caddy/Nginx) so the
Telegram webhook works.

## 3) Bare Node

```bash
npm ci
npm run build
NODE_ENV=production OWNER_IDS=… MCP_TOKEN_SECRET=… \
  npx prisma db push --skip-generate
node dist/index.js            # or use pm2: pm2 start dist/index.js --name kia
```

---

## Client setup

- **Telegram** — works as soon as `BOT_TOKEN` is set (webhook or long-polling).
- **Web** — visit your `PUBLIC_URL`; install as PWA from the browser menu. Owner APIs
  unlocked in the dashboard's Owner tab with your `DASHBOARD_KEY`.
- **Desktop** — `cd desktop && npm install && KIA_URL=https://your-app npm start`
  (or build installers: `npm run dist:all`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy fails at `prisma generate` | ensure you didn't remove the `postinstall` script |
| Bot silent in production | `PUBLIC_URL` missing/wrong → webhook never registers; check logs |
| `401` in dashboard Owner tab | `X-KIA-Key` ≠ `DASHBOARD_KEY` (falls back to `MCP_TOKEN_SECRET`) |
| Data resets after redeploy | Volume not mounted at `/app/db` |
| AI replies say "offline" | `AI_API_KEY` empty — platform runs deterministic fallbacks by design |
