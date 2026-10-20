# 🏷️ Brand Kit — white-label an instance in 5 minutes

One deployment = one brand. Rebrand **without touching code**, at boot or live.

## 1. The three switches

| Layer | Env variable | What it changes |
|---|---|---|
| Name everywhere | `BRAND_NAME` | bot welcome, dashboard header/title/footer, desktop shell |
| Tagline | `BRAND_TAGLINE` | sidebar sub-line under the logo |
| Footer | `BRAND_FOOTER` | dashboard footer line (leave empty to hide) |

```bash
# Railway → Variables — or local .env
BRAND_NAME=Café Luna AI
BRAND_TAGLINE=Your table, one message away
BRAND_FOOTER=© Café Luna — powered by Luna
```

Redeploy (or restart) once and every surface — Telegram bot, PWA dashboard,
desktop app — now shows the new identity.

## 2. Live rebrand (no redeploy)

The dashboard's Owner panel writes the same values as runtime settings:

```
PUT /api/v1/settings  { "key": "brand_name",    "value": "Café Luna AI" }
PUT /api/v1/settings  { "key": "brand_tagline", "value": "Your table, one message away" }
PUT /api/v1/settings  { "key": "brand_footer",  "value": "© Café Luna" }
```

Priority: **DB setting → env → built-in default**. Empty setting = env wins.
The dashboard rebrands itself on next load (`GET /api/v1/brand` is public —
no owner key needed to *display* the brand).

## 3. Per-client checklist (do this for every sale)

- [ ] `BRAND_*` env vars set in the client's Railway project
- [ ] Bot name + description + about text updated via @BotFather
- [ ] Bot profile photo uploaded (client logo)
- [ ] Knowledge base seeded with the client's real FAQ (RAG quality = perceived IQ)
- [ ] 3–6 real products/services seeded (`npm run seed` then edit, or dashboard)
- [ ] `support_telegram` setting → client's support handle
- [ ] `OWNER_IDS` = client's Telegram ID (they approve their own HITL queue)
- [ ] Desktop shortcut shipped: `desktop/` → set `KIA_DASHBOARD_URL` to their domain

## 4. What stays yours

The license is MIT — the client owns their instance and their data. Your
upside is the retainer (see [ZENOVIX-UPSELL.md](ZENOVIX-UPSELL.md)), not lock-in.
Say this out loud in demos; it closes deals.
