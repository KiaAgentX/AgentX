/**
 * electron-builder afterPack hook — Windows EXE branding without wine.
 *
 * electron-builder on Linux normally uses wine+rcedit to embed the app icon
 * and version metadata into DropAgentX.exe. This container has no wine, so we
 * do the same job with the pure-JS `resedit` PE editor + `png2icons` encoder
 * BEFORE the NSIS target packs the app dir into the installer.
 *
 * (win.signAndEditExecutable is set to false in electron-builder.yml — this
 * hook replaces that step natively.)
 */
const path = require('path');
const fs = require('fs');
const png2icons = require('png2icons');

const ROOT = path.join(__dirname, '..');
const PNG = path.join(ROOT, 'public', 'icons', 'icon-512.png');
const LANG = 1033; // en-US
const CP = 1200; // default Unicode codepage
const VERSION = require(path.join(ROOT, 'package.json')).version;

/** @param {import('app-builder-lib').AfterPackContext} context */
module.exports = async function afterPack(context) {
  // ── 1) Copy the generated Prisma client (node_modules/.prisma) into the app ──
  // The electron-builder dependency collector never sees node_modules/.prisma
  // (generated, dot-directory, not a declared dependency) — with asar disabled
  // a plain recursive copy makes it resolvable at runtime on every platform.
  const srcClient = path.join(ROOT, 'node_modules', '.prisma');
  const destClient = path.join(context.appOutDir, 'resources', 'app', 'node_modules', '.prisma');
  if (fs.existsSync(path.join(srcClient, 'client', 'index.js'))) {
    fs.cpSync(srcClient, destClient, { recursive: true });
    const engines = fs
      .readdirSync(path.join(destClient, 'client'))
      .filter((f) => f.endsWith('.node') || f.endsWith('.dll.node') || f.includes('query_engine'));
    console.log(`[afterpack] prisma client copied (${engines.length} engine binaries: ${engines.join(', ')})`);
  } else {
    console.warn('[afterpack] node_modules/.prisma/client missing — run `npx prisma generate` first');
  }

  // ── 2) Windows-only PE branding (icon + version metadata), no wine needed ──
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  if (!fs.existsSync(exePath) || !fs.existsSync(PNG)) {
    console.warn('[afterpack] exe or icon missing — skipping branding');
    return;
  }

  // resedit v2 ships ESM only — load dynamically from this CJS hook.
  const resedit = await import('resedit');

  // 1) PNG → multi-size ICO (BMP entries for the classic Windows size set).
  const ico = png2icons.createICO(fs.readFileSync(PNG), png2icons.BICUBIC, 0, false, true);
  if (!ico) throw new Error('png2icons produced no ICO output');

  // 2) Parse the packed EXE and patch its resources.
  const exe = resedit.NtExecutable.from(fs.readFileSync(exePath));
  const res = resedit.NtExecutableResource.from(exe);

  const iconFile = resedit.Data.IconFile.from(ico);
  const existingGroups = resedit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = existingGroups.length > 0 ? existingGroups[0].id : 1;
  const groupLang = existingGroups.length > 0 ? existingGroups[0].lang : LANG;

  resedit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groupId,
    groupLang,
    iconFile.icons.map((item) => item.data)
  );

  // 3) Version metadata (Explorer → Properties → Details).
  let viList = resedit.Resource.VersionInfo.fromEntries(res.entries);
  let vi;
  if (viList.length > 0) {
    vi = viList[0];
  } else {
    vi = resedit.Resource.VersionInfo.create(LANG, {}, []);
    vi.outputToResourceEntries(res.entries);
  }
  const [maj, min, build] = VERSION.split('.').map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  vi.setFileVersion(maj || 0, min || 0, build || 0, 0, LANG);
  vi.setProductVersion(maj || 0, min || 0, build || 0, 0, LANG);
  vi.setStringValues(
    { lang: LANG, codepage: CP },
    {
      CompanyName: 'KiaAgentX',
      FileDescription: 'XDrop — Telegram Super-App Command Center',
      FileVersion: VERSION,
      InternalName: 'DropAgentX',
      LegalCopyright: 'Copyright © 2026 KiaAgentX',
      OriginalFilename: 'DropAgentX.exe',
      ProductName: 'DropAgentX',
      ProductVersion: VERSION,
    }
  );
  vi.outputToResourceEntries(res.entries);

  // 4) Write the patched binary back (NSIS packs it right after this hook).
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`[afterpack] branded ${path.basename(exePath)} — icon group ${groupId} + version ${VERSION}`);
};
