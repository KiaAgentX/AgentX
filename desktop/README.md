# XDrop — Desktop App (Windows / macOS / Linux)

**Standalone desktop app** — installs like any Windows program and runs the
ENTIRE XDrop platform locally: dashboard UI + Telegram bot + cron, all inside
one Electron shell. No server, no Node.js, no terminal needed.

## Install (Windows)

1. Download `DropAgentX-Setup-1.3.0.exe` (NSIS installer, ~118 MB).
2. Run it → **Next → Next → Install → Finish** (per-user install — no admin
   rights required; Start-Menu + Desktop shortcuts are created).
3. Launch **DropAgentX** — the dashboard opens and is already unlocked.
4. (Optional) Enable the Telegram bot: tray icon → **Edit Config (.env)** →
   paste your token from @BotFather into `BOT_TOKEN=` → save → tray →
   **Restart Service**.

> SmartScreen note: the installer is unsigned (no code-signing certificate).
> Windows may show "Windows protected your PC" → click **More info → Run
> anyway**. You can verify the MD5 checksum before running.

## What happens on first run

Everything is automatic, inside `%APPDATA%\DropAgentX`:

| Item | What the app does |
|---|---|
| `data/custom.db` | Restores the bundled recovered database snapshot (466 users, reconciled ledger) |
| `.env` | Generates private secrets (32-byte hex via `crypto.randomBytes`) + a unique dashboard key |
| `logs/xdrop.log` | Captures all platform logs for support |

The dashboard key is injected into the app automatically — the panel opens
unlocked. Port 3000 is used when free; otherwise the next free port is chosen.

## Tray menu

Show Dashboard · Open in Browser · **Edit Config (.env)** · **Open Data
Folder** · **Open Logs** · **Restart Service** · Quit

Closing the window keeps XDrop running in the tray (money paths and the bot
keep working). Quit stops everything cleanly.

## Build it yourself

```bash
# on a Linux CI/host (no wine required) or on Windows/macOS
npm ci
npx prisma generate                # bundles the Windows query engine
npm run desktop:build              # → release/DropAgentX-Setup-<version>.exe
```

Pipeline notes:

- `scripts/eb-afterpack.cjs` — copies the generated Prisma client into the app
  and embeds the EXE icon + version metadata with pure-JS `resedit`
  (`win.signAndEditExecutable` is disabled because rcedit needs wine).
- `scripts/patch-nsis-nowine.cjs` — switches the NSIS uninstaller-stub
  extraction to electron-builder's built-in pure-JS reader (no wine).
- Rebuilds are reproducible from a clean clone: `npm ci && npx prisma
  generate && npm run build && npm run desktop:build`.

## Where is what (installed)

```
C:\Users\<you>\AppData\Local\Programs\DropAgentX\   ← app (per-user)
C:\Users\<you>\AppData\Roaming\DropAgentX\
  ├── .env                                          ← config + secrets (private!)
  ├── data\custom.db                                ← your live database
  └── logs\xdrop.log                                ← platform logs
```

Back up `data\custom.db` regularly (copy the file while the app is running is
safe enough for SQLite in WAL-less mode; stop the service first for a perfect
snapshot: tray → Quit → copy → relaunch).

##macOS / Linux

The same shell builds for macOS (`--mac dmg`) and Linux (`--linux`) with
`npx electron-builder -mwl`; behaviour is identical (userData in
`~/Library/Application Support/DropAgentX` / `~/.config/DropAgentX`).
