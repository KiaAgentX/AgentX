/**
 * KIA DropAgentX — Desktop shell (Electron).
 * Wraps the web dashboard in a native window with tray support.
 *
 * Env:
 *   KIA_URL — dashboard URL (default http://localhost:3000; set to your Railway URL for a cloud client)
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');

const APP_URL = process.env.KIA_URL || 'http://localhost:3000';
let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#09090b',
    title: 'KIA DropAgentX',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL);

  win.once('ready-to-show', () => win.show());

  // Open external links in the system browser, never inside the shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide(); // keep running in tray
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('KIA DropAgentX');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Dashboard', click: () => (win ? (win.show(), win.focus()) : createWindow()) },
      { label: 'Open in Browser', click: () => shell.openExternal(APP_URL) },
      { type: 'separator' },
      { label: 'Quit', click: () => ((app.isQuiting = true), app.quit()) },
    ])
  );
  tray.on('click', () => (win ? (win.isVisible() ? win.hide() : win.show()) : createWindow()));
}

const template = [
  {
    label: 'KIA',
    submenu: [
      { label: 'Dashboard', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() },
      { label: 'Open in Browser', click: () => shell.openExternal(APP_URL) },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
