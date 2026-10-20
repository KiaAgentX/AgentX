# ⚔️ War Machine — 3-channel outreach loop

A repeatable weekly system to keep the pipeline full. Everything logs into the
built-in Lead CRM, so the loop is measurable from day one.

## The loop (weekly cadence)

```
Scrape/collect 50 prospects → import (dedupe) → 3-channel touch →
book demo → run DAY1-SALES-KIT → stage move → follow up in 72h
```

### Channel 1 — Telegram (primary)
- Find group admins / channel owners in the niche (marketplace owners, local
  business hubs, crypto communities).
- Personal, 3 sentences max: who you are → what their members lose → 1 question.
- Never paste links cold. Ask permission, then send the demo bot deep-link
  `https://t.me/<bot>?start=ref_<their-handle>` — the referral code tells you
  which prospect converted.

### Channel 2 — Email
- Subject: `<Their business> — your customers ask the same 6 questions daily`
- Body: 90 words. One screenshot (dashboard with their brand name mocked).
- CTA: "Reply 'demo' and I'll send a bot that answers in your language — live."

### Channel 3 — Voice note (the closer)
- 40 seconds, friendly, no script-read energy.
- Structure: pattern interrupt → one specific pain → "I built the fix, want to
  see it on your own brand?" → send the white-labeled demo.

## CRM discipline (the machine part)

| Event | CRM action |
|---|---|
| Prospect collected | `/lead <contact> "Name"` — stage `new`, tag the niche |
| Any reply | stage → `warm`, log the pain point in `notes` |
| Demo booked | keep `warm`, tag `demo-booked` |
| Demo done, no close | stage → `warm` again only if they set a follow-up; else `lost` |
| Signed | stage → `won` — conversion % updates on the dashboard |

Rules: **touch each lead max 3× / week**, never two channels on the same day.
Every Sunday: filter `stage=warm`, plan the week, archive dead leads to `lost`.

## Metrics that matter

- `new → warm` reply rate (target ≥ 15% with a personal first line)
- `warm → demo` booking rate (target ≥ 30%)
- `demo → won` close rate (target ≥ 25% with the Day-1 kit)
- Weekly `won` count feeds the upsell motion — see [ZENOVIX-UPSELL.md](ZENOVIX-UPSELL.md).
