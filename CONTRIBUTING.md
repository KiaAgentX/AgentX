# Contributing to KIA DropAgentX

Thanks for helping make KIA better! 🎉

## Ground rules

1. **TypeScript strict** — `npm run typecheck` must pass with zero errors.
2. **Money is integer** — credits and Stars are integers, always. No floats.
3. **Fail-closed** — new tools/actions must go through the security pipeline
   (`src/core/security`) and, when risky, the HITL queue (`src/lib/hitl.service.ts`).
4. **Services don't call Telegram** — emit bus events instead
   (`src/lib/bus.ts`), let channels subscribe.
5. **No secrets in code** — config comes from `src/config.ts` (zod env).
6. **i18n** — user-facing strings go through `t(lang, key)`; add missing keys to
   `locales/en.json` first.

## Workflow

```bash
fork → branch (feat/my-feature) → commit → pull request
```

- Keep PRs focused; one feature or fix per PR.
- Describe **what** and **why**; screenshots for dashboard changes are appreciated.
- CI runs `typecheck + build` on every push — keep it green.

## Code style

- Named exports only, no default exports.
- No `console.log` in runtime code — use `src/lib/logger.ts`.
- Comments explain *why*, not *what*.

## Reporting bugs / proposing features

Open a GitHub Issue with reproduction steps (bugs) or a problem statement + proposal
(features). Security issues: see [docs/SECURITY.md](docs/SECURITY.md) — never in public.
