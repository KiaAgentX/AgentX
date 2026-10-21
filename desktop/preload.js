/**
 * Preload — minimal, safe bridge between the dashboard and the desktop shell.
 */
const { contextBridge, app } = require('electron');

contextBridge.exposeInMainWorld('kia', {
  platform: 'desktop',
  version: (() => { try { return app.getVersion(); } catch { return '1.3.0'; } })(),
});
