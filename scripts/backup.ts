/**
 * XDrop (KIA DropAgentX) — database backup
 * -----------------------------------------
 * Creates a consistent, online-safe snapshot of the SQLite database using
 * `VACUUM INTO` through Prisma (works while the server is running — no
 * downtime, no locks, no node:sqlite dependency → runs on any Node ≥ 20).
 *
 * Path semantics match Prisma exactly: relative `file:` URLs resolve against
 * the prisma/ schema directory, so `file:../db/custom.db` works identically
 * in the repo, in Docker and in release ZIP layouts.
 *
 * Usage:
 *   npm run backup                 → db/backups/kia-YYYY-MM-DD-HHMMSS.db
 *   npm run backup -- --keep 10    → keep the 10 newest snapshots (default 30)
 *   npm run backup -- --out /path  → custom output directory
 *
 * Restore:
 *   stop the server, replace your DATABASE_URL file with the snapshot, restart.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { db as prisma } from "../src/core/db";
import { config } from "../src/config";

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Resolve the SQLite file exactly like Prisma: relative to prisma/. */
function resolveDbPath(databaseUrl: string): string {
  const raw = databaseUrl.replace(/^file:/, "");
  if (raw.startsWith("/")) return raw;
  const prismaDir = resolve(__dirname, "..", "prisma");
  return resolve(prismaDir, raw);
}

const absSrc = resolveDbPath(config.databaseUrl);

if (!existsSync(absSrc)) {
  console.error(`❌ Database file not found: ${absSrc}`);
  console.error(`   DATABASE_URL=${config.databaseUrl}`);
  console.error("   Check that the file exists (a fresh deploy may need `npm run setup` first).");
  process.exit(1);
}

const keep = Math.max(1, parseInt(argValue("--keep") ?? "30", 10) || 30);
const outDir = resolve(argValue("--out") ?? resolve(absSrc, "..", "backups"));

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  const stamp = new Date()
    .toISOString()
    .replace("T", "-")
    .replace(/:/g, "")
    .replace(/\..+$/, "");
  const dest = join(outDir, `kia-${stamp}.db`);

  try {
    // VACUUM INTO produces a clean, compacted, transactionally consistent copy.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  const sizeMb = (statSync(dest).size / 1024 / 1024).toFixed(2);

  // Retention: prune oldest snapshots beyond `keep`
  const snapshots = readdirSync(outDir)
    .filter((f) => f.startsWith("kia-") && f.endsWith(".db"))
    .sort()
    .reverse();
  for (const old of snapshots.slice(keep)) {
    try {
      unlinkSync(join(outDir, old));
    } catch {
      /* best effort */
    }
  }

  console.log(`✅ Backup created: ${dest} (${sizeMb} MB)`);
  console.log(`   Source: ${absSrc}`);
  console.log(`   Retention: kept ${Math.min(keep, snapshots.length)} newest in ${outDir}`);
}

main().catch((err) => {
  console.error("❌ Backup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
