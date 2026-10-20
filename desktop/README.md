# KIA DropAgentX — Desktop App

Native shell (Electron) for the KIA DropAgentX dashboard — Windows, macOS and Linux.

## Run (dev)

```bash
# 1) Make sure the core platform is running (local or Railway)
#    Local:   npm run dev          → http://localhost:3000
#    Railway: copy your public URL, e.g. https://kiadropagentx.up.railway.app

# 2) Start the desktop shell
cd desktop
npm install
npm start                        # loads http://localhost:3000
KIA_URL=https://your-app.up.railway.app npm start   # cloud mode
```

## Build installers (optional)

```bash
npm run dist          # unpacked build
npm run dist:all      # dmg + nsis + AppImage
```

## Features

- Native window with dark chrome matching the dashboard theme
- System **tray icon** — close-to-tray, quick “Show Dashboard / Open in Browser / Quit”
- External links open in the system browser (never inside the shell)
- `Ctrl/Cmd+R` reload, zoom controls, dev tools under **View**
- Context-isolated preload bridge: `window.kia = { platform: 'desktop', version }`

> The desktop app is a client — your bot, database and API keep running on the
> server (Railway). One deployment powers Web + Telegram + Desktop at once.
