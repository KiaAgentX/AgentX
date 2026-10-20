/**
 * Preload — minimal, safe bridge between the dashboard and the desktop shell.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('kia', {
  platform: 'desktop',
  version: '1.0.0',
});
