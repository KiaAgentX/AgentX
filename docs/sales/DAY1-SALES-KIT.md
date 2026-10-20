# 🚀 Day-1 Sales Kit — first demo to first invoice

Everything you need to sell a KIA DropAgentX instance **today**. Total time
budget: one afternoon. The product sells itself once the prospect sees *their*
business inside it.

---

## 1. Spin up a demo in 10 minutes

```bash
git clone https://github.com/KiaAgentX/KIAdropAgentX && cd KIAdropAgentX
npm install && npm run setup          # install + db + demo data
BRAND_NAME="Café Luna AI" BOT_USERNAME=… OWNER_IDS=<your-tg-id> npm run dev
```

- Open the dashboard → the whole UI now says **Café Luna AI** (white-label works).
- Send `/start` to your bot → welcome bonus, quests, wallet, AI receptionist.
- The 6 seeded demo products + knowledge base make the AI give *grounded* answers.

## 2. The 4 preset demos (pick the prospect's industry)

Seed a matching catalog before the call (see `scripts/seed.ts` — edit the
preset products once, reuse forever):

| Prospect | Demo angle | Killer moment |
|---|---|---|
| ☕ Restaurant / café | menu as products, "reserve a table" booking | AI takes the order in *their* language |
| 🏋️ Gym | memberships as products, quests for check-ins | streak + leaderboard on the phone |
| 💇 Salon | services + booking slots, reminder cron | "no more no-shows" |
| 🛠 Agency | resell: "this is *your* bot, your brand, your clients" | white-label in 5 seconds |

## 3. The demo script (12 minutes)

1. **Hook (1 min)** — "You pay for 4 tools: booking, CRM, broadcast, support.
   This is all four, in the app your customers already open 40×/day."
2. **Live chat (3 min)** — ask the bot in the prospect's own language; show the
   AI answering from *their* knowledge base (RAG), not generic ChatGPT text.
3. **Money flow (3 min)** — buy a product with Telegram Stars → escrow order →
   deliver → owner gets notified. Show the **HITL approval** for a refund:
   "AI never touches money without *your* tap."
4. **Owner dashboard (3 min)** — live KPIs, sales chart, orders feed, audit log,
   kill-switch. One screen that runs their business.
5. **Close (2 min)** — "Setup fee covers install + brand + staff training.
   Then it's £29/month, cancel anytime. I can have your bot live in 48 hours."

## 4. Objection handling

| Objection | Answer |
|---|---|
| "Is AI safe with my customers?" | 15-layer security, fail-closed: worst case it goes silent, never insults anyone. Show the audit log. |
| "What if it makes a mistake with money?" | It can't. Refunds/withdrawals/broadcasts wait for human approval and **expire** if you don't decide. |
| "My customers speak X" | 25 languages built-in, RTL included. Type in X live. |
| "I already have a website" | Great — this is not a website, it's where your customers already are. Plus a dashboard you can open anywhere. |
| "Too expensive" | Break down: booking app + CRM + AI support ≫ £29. And there's no per-seat pricing. |

## 5. After the demo (same day)

- Send the recording + a one-page summary (this file's script).
- Offer the **48-hour pilot**: their brand, 3 products, 1 week free.
- Log the prospect in the CRM: `POST /api/v1/leads` or `/lead +4477… "Name"` —
  stage `new`. Follow up = move to `warm`. Signed = `won`. The CRM *you just
  sold them* is the same one tracking them. That's the pitch.
