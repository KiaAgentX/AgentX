# Security Policy

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, send a private report to the maintainer (`SUPPORT_CONTACT` in `.env`)
with:

1. Description of the issue and potential impact
2. Steps to reproduce (PoC if possible)
3. Affected version (`/healthz` → `version`)

You will get an acknowledgment within 72 hours and a status update within 7 days.

## Supported Versions

| Version | Supported |
|---|---|
| 5.x (Ultimate) | ✅ |
| < 5.0 | ❌ upgrade please |

## Deployment Hardening Checklist

- [ ] `WEB_SECRET` set to a random 32+ char value (cookie signing)
- [ ] `WEB_PASSWORD` strong; `COOKIE_SECURE=1` behind TLS
- [ ] `BOT_TOKEN` / `CRM_TOKEN` only in Railway Variables — never in git
- [ ] `.env` is git-ignored (verify: `git check-ignore .env`)
- [ ] Repo is **private** until you decide otherwise
- [ ] Railway Volume + `DATA_DIR` so the database is not ephemeral
- [ ] Admin IDs limited to real operators (`ADMIN_IDS`)

## Known Design Guarantees

- Secrets are redacted from logs (`hermes_engine.redact_secrets`)
- Admin POSTs require origin header (`x-requested-with: fetch`) → CSRF-safe
- CRM import requires admin cookie or `x-crm-token`
- Human-in-the-loop: outbound messages are drafts; sending is always manual
- No private keys or wallet seeds are ever handled by the bot
