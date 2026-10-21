/**
 * KIA DropAgentX — Desktop shell (Electron) — STANDALONE LOCAL HOST.
 *
 * Unlike a thin client, this shell runs the ENTIRE platform locally:
 *   1. Bootstraps a per-user data dir  (%APPDATA%/DropAgentX on Windows)
 *      - first run: copies the bundled recovered database snapshot
 *      - generates a private .env (secrets via crypto.randomBytes)
 *   2. Spawns dist/index.js (web + bot + cron) as an isolated utilityProcess
 *      with crash-restart backoff and log capture to logs/xdrop.log
 *   3. Opens a native window on the local dashboard and auto-unlocks it
 *      by injecting the generated DASHBOARD_KEY into localStorage.
 *
 * Bot token: paste it into the .env (tray → Edit Config → Restart).
 * Without a token the app runs in WEB-ONLY mode (dashboard + API live).
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');

// ── Paths ────────────────────────────────────────────────────────────────────
// ROOT = app root (repo root in dev, app.asar when packaged)
const ROOT = path.join(__dirname, '..');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.js');
const SNAPSHOT_DB = app.isPackaged
  ? path.join(process.resourcesPath, 'data', 'custom.db')
  : path.join(ROOT, 'db', 'custom.db');
const TRAY_ICON = path.join(ROOT, 'public', 'icons', 'icon-192.png');

// ── State ────────────────────────────────────────────────────────────────────
let win = null;
let tray = null;
let server = null;           // utilityProcess child
let serverStarts = 0;        // restart counter
let PORT = 3000;
let ENV_PATH = '';
let DATA_DIR = '';
let DB_PATH = '';
let DASHBOARD_KEY = '';
let envValues = {};          // parsed .env (source of truth for child env)
const restartDelays = [1000, 3000, 8000, 20000];

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ── tiny helpers ─────────────────────────────────────────────────────────────
const log = (...a) => console.log('[dropagentx]', ...a);

function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k) out[k] = v;
  }
  return out;
}

function genSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function findFreePort(start, tries = 20) {
  return new Promise((resolve) => {
    const tryPort = (p, n) => {
      if (n <= 0) return resolve(start);
      const srv = net.createServer();
      srv.once('error', () => tryPort(p + 1, n - 1));
      srv.once('listening', () => srv.close(() => resolve(p)));
      srv.listen(p, '127.0.0.1');
    };
    tryPort(start, tries);
  });
}

function defaultEnvTemplate(dbPath, port) {
  const url = 'file:' + dbPath.split(path.sep).join('/');
  return `# ── DropAgentX desktop environment ─────────────────────────────────
# فایل پیکربندی — پس از تغییر، از آیکون کنار ساعت برنامه را Restart کنید.
# Generated automatically. Edit BOT_TOKEN / AI_API_KEY freely, then use
# the tray menu → "Restart Service".
NODE_ENV=production
PORT=${port}

# Telegram bot (خالی = فقط پنل وب فعال است)
# توکن ربات را از @BotFather اینجا بگذارید و برنامه را Restart کنید:
BOT_TOKEN=
BOT_USERNAME=XdropmeXbot

# اعضای مالک (Telegram ID) — با کاما جدا شود
OWNER_IDS=
ADMIN_IDS=
WHITELIST_ONLY=false

# ── Secrets (auto-generated per install — never share this file) ──
MCP_TOKEN_SECRET=${genSecret()}
A2A_SECRET=${genSecret()}
DASHBOARD_KEY=${genSecret()}
TELEGRAM_WEBHOOK_SECRET=${genSecret()}
RATE_LIMIT_PER_MIN=30
DAILY_SPEND_LIMIT=500000
APPROVAL_TTL_MIN=60

# AI (اختیاری — کلید OpenAI-سازگار برای فعال شدن ۶ ایجنت هوشمند)
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-4o-mini

DATABASE_URL=${url}

ENABLE_MARKETPLACE=true
ENABLE_QUESTS=true
ENABLE_REFERRAL=true
ENABLE_BOOKINGS=true
ENABLE_RADAR=false
ENABLE_AUTO_REPORTS=true
REPORT_TZ=UTC
WEB_CORS_ORIGINS=*
BRAND_NAME=XDrop Marketplace
BRAND_TAGLINE=Command center
BRAND_FOOTER=
`;
}

/** Create/repair the per-user environment. Returns parsed env values. */
async function ensureEnvironment() {
  DATA_DIR = path.join(app.getPath('userData'), 'data');
  const LOG_DIR = path.join(app.getPath('userData'), 'logs');
  DB_PATH = path.join(DATA_DIR, 'custom.db');
  ENV_PATH = path.join(app.getPath('userData'), '.env');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  // First run (or DB deleted) → restore the bundled recovered snapshot.
  if (!fs.existsSync(DB_PATH)) {
    if (fs.existsSync(SNAPSHOT_DB)) {
      fs.copyFileSync(SNAPSHOT_DB, DB_PATH);
      log('db snapshot restored →', DB_PATH);
    } else {
      log('no bundled snapshot — Prisma will create an empty DB');
    }
  }

  // .env — create when missing, repair blank secrets.
  if (!fs.existsSync(ENV_PATH)) {
    PORT = await findFreePort(3000);
    fs.writeFileSync(ENV_PATH, defaultEnvTemplate(DB_PATH, PORT), 'utf8');
    log('.env generated →', ENV_PATH);
  } else {
    envValues = parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8'));
    // Repair passes: blank/insecure secrets, missing DATABASE_URL.
    const needsRepair =
      !envValues.DASHBOARD_KEY || !envValues.MCP_TOKEN_SECRET ||
      envValues.MCP_TOKEN_SECRET === 'kia-dev-secret-change-me' || !envValues.DATABASE_URL;
    if (needsRepair) {
      PORT = Number(envValues.PORT) > 0 ? Number(envValues.PORT) : await findFreePort(3000);
      fs.writeFileSync(ENV_PATH, defaultEnvTemplate(DB_PATH, PORT), 'utf8');
      log('.env repaired');
    }
    // DB moved/renamed on upgrade → point back to the per-user copy.
    if (envValues.DATABASE_URL && envValues.DATABASE_URL !== 'file:' + DB_PATH.split(path.sep).join('/')) {
      const url = 'file:' + DB_PATH.split(path.sep).join('/');
      let text = fs.readFileSync(ENV_PATH, 'utf8');
      text = /^DATABASE_URL=.*$/m.test(text)
        ? text.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=' + url)
        : text + '\nDATABASE_URL=' + url + '\n';
      fs.writeFileSync(ENV_PATH, text, 'utf8');
    }
  }

  envValues = parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8'));
  DASHBOARD_KEY = envValues.DASHBOARD_KEY || '';
  PORT = Number(envValues.PORT) > 0 ? Number(envValues.PORT) : 3000;

  // Child env — explicit, dotenv-independent (same values, no drift).
  // Empty strings are OMITTED: some spawn pipelines drop empty env vars,
  // which would re-expose the child to a stray .env in the launch cwd.
  // The child's cwd is set to the userData dir, so `dotenv/config` inside
  // the server reads OUR .env — never one from the install directory.
  const childEnv = Object.fromEntries(
    Object.entries(envValues).filter(([, v]) => v !== '')
  );
  childEnv.NODE_ENV = 'production';
  childEnv.PORT = String(PORT);
  childEnv.DATABASE_URL = 'file:' + DB_PATH.split(path.sep).join('/');
  childEnv.ELECTRON_NO_ATTACH_CONSOLE = '1';
  return { childEnv, LOG_DIR, USER_DIR: app.getPath('userData') };
}

// ── server lifecycle ─────────────────────────────────────────────────────────
function appendLog(logDir, tag, chunk) {
  try {
    fs.appendFileSync(path.join(logDir, 'xdrop.log'), `[${new Date().toISOString()}] [${tag}] ${chunk}`);
  } catch { /* ignore */ }
}

function startServer(childEnv, LOG_DIR, USER_DIR) {
  if (server) return;
  serverStarts += 1;
  log('starting platform server (attempt', serverStarts + ')');
  const child = utilityProcess.fork(DIST_INDEX, [], {
    serviceName: 'xdrop-server',
    cwd: USER_DIR,
    env: childEnv,
    stdio: 'pipe',
  });
  server = child;
  child.stdout?.on('data', (c) => appendLog(LOG_DIR, 'out', c.toString()));
  child.stderr?.on('data', (c) => appendLog(LOG_DIR, 'err', c.toString()));
  child.on('exit', (code) => {
    server = null;
    log('server exited with code', code);
    if (app.isQuiting) return;
    const delay = restartDelays[Math.min(serverStarts - 1, restartDelays.length - 1)];
    setTimeout(() => {
      if (!app.isQuiting && !server) {
        startServer(childEnv, LOG_DIR, USER_DIR);
        pollAndLoad(LOG_DIR);
      }
    }, delay);
  });
}

async function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (app.isQuiting) return false;
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function pollAndLoad(LOG_DIR) {
  const ok = await waitForHealth();
  if (!ok) {
    if (win && !win.isDestroyed()) {
      win.loadURL('data:text/html,' + encodeURIComponent(
        `<body style="font-family:sans-serif;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>⏳ XDrop is starting…</h1><p>If this persists, open the tray menu → Open Logs</p></div></body>`
      ));
    }
    return;
  }
  if (win && !win.isDestroyed()) {
    win.loadURL(`http://127.0.0.1:${PORT}/`).catch(() => {});
  }
}

// ── window & tray ────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#09090b',
    title: 'XDrop — DropAgentX',
    autoHideMenuBar: true,
    icon: path.join(ROOT, 'public', 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://127.0.0.1:${PORT}/`).catch(() => pollAndLoad(DATA_DIR ? path.dirname(ENV_PATH) : ''));

  win.once('ready-to-show', () => win.show());

  // Auto-unlock: sync the generated dashboard key into localStorage (once).
  if (DASHBOARD_KEY) {
    win.webContents.on('did-finish-load', async () => {
      try {
        const key = JSON.stringify(DASHBOARD_KEY);
        const stale = await win.webContents.executeJavaScript(`(localStorage.getItem('kia_key')||'')!==${key}`);
        if (stale) {
          await win.webContents.executeJavaScript(`localStorage.setItem('kia_key', ${key}); 'ok'`);
          win.webContents.executeJavaScript('location.reload()');
        }
      } catch { /* dashboard not ready yet */ }
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.reload();
  });

  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide(); // keep serving from the tray
    }
  });
}

function createTray(LOG_DIR) {
  const icon = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('XDrop — DropAgentX');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Dashboard', click: () => (win ? (win.show(), win.focus()) : createWindow()) },
      { label: 'Open in Browser', click: () => shell.openExternal(`http://127.0.0.1:${PORT}`) },
      { type: 'separator' },
      { label: 'Edit Config (.env)', click: () => shell.openPath(ENV_PATH) },
      { label: 'Open Data Folder', click: () => shell.openPath(path.dirname(ENV_PATH)) },
      { label: 'Open Logs', click: () => shell.openPath(LOG_DIR) },
      { type: 'separator' },
      {
        label: 'Restart Service',
        click: () => {
          if (server) server.kill();
        },
      },
      { label: 'Quit', click: () => ((app.isQuiting = true), app.quit()) },
    ])
  );
  tray.on('click', () => (win ? (win.isVisible() ? win.hide() : win.show()) : createWindow()));
}

// ── app lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  let childEnv, LOG_DIR, USER_DIR;
  try {
    ({ childEnv, LOG_DIR, USER_DIR } = await ensureEnvironment());
  } catch (err) {
    dialog.showErrorBox('XDrop — startup error', String(err && err.stack || err));
    app.quit();
    return;
  }

  startServer(childEnv, LOG_DIR, USER_DIR);
  createWindow();
  createTray(LOG_DIR);
  void pollAndLoad(LOG_DIR);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (win) {
    win.show();
    win.focus();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  try { if (server) server.kill(); } catch { /* ignore */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
