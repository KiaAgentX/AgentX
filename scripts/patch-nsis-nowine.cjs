/**
 * Patch electron-builder's NSIS target to build on Linux WITHOUT wine.
 *
 * Why: NsisTarget builds the Setup.exe, then normally RUNS it under wine to
 * extract the uninstaller stub. This container has no wine. electron-builder
 * already ships a pure-JS uninstaller extractor (`UninstallerReader.exec`,
 * used on macOS Catalina where 32-bit wine is unavailable) — this patch makes
 * the Linux host take that same no-execution path.
 *
 * Idempotent; run before `electron-builder --win`. Wired into
 * `npm run desktop:build`.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
const needle = 'if ((0, macosVersion_1.isMacOsCatalina)()) {';
const patched = 'if (true) { // patched by scripts/patch-nsis-nowine.cjs — pure-JS uninstaller extraction, no wine';

if (!fs.existsSync(target)) {
  console.warn('[patch-nsis-nowine] NsisTarget.js not found — skipping');
  process.exit(0);
}
let src = fs.readFileSync(target, 'utf8');
if (src.includes(patched)) {
  console.log('[patch-nsis-nowine] already patched');
  process.exit(0);
}
if (!src.includes(needle)) {
  console.warn('[patch-nsis-nowine] needle not found (electron-builder changed?) — skipping patch');
  process.exit(0);
}
fs.writeFileSync(target, src.replace(needle, patched));
console.log('[patch-nsis-nowine] NsisTarget.js patched — uninstaller extraction will not need wine');
