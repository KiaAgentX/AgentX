#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# XDrop (KIA DropAgentX) — release ZIP builder (reproducible, secrets-safe)
#
# Builds a self-contained restore kit from the current git HEAD:
#   • full source + docs + screenshots + nation assets
#   • db/custom.db snapshot (fresh, from the LIVE database — private data!)
#   • .env with PLACEHOLDER secrets (never ships real values)
#   • no node_modules / .git / dist / logs / backups
#
# Usage:  sh scripts/make-release-zip.sh [output-dir]
# Output: <output-dir>/DropAgentX-<version>-final.zip
#
# ⚠️  The ZIP contains the restored database (real users). It is meant for the
#     OWNER's private deployment — do not publish it. The repository itself
#     (.gitignore'd db/ + .env) stays safe to publish.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

VERSION=$(node -p "require('./package.json').version")
OUT_DIR=${1:-..}
STAGING=$(mktemp -d)
NAME="DropAgentX"
ZIP="$OUT_DIR/DropAgentX-v$VERSION-final.zip"
ROOT="$STAGING/$NAME"
mkdir -p "$ROOT"

echo "→ staging $NAME v$VERSION …"

# 1) Git-tracked files only (respects .gitignore — no .env, no db, no logs)
git archive HEAD | tar -x -C "$ROOT"

# 2) Fresh DB snapshot from the live database (VACUUM INTO, online-safe)
mkdir -p "$ROOT/db"
npx tsx scripts/backup.ts --out "$ROOT/db" >/dev/null 2>&1 || {
  # fallback: copy the file directly when offline backup is unavailable
  SRC=$(node -e "console.log(require('fs').existsSync('db/custom.db')?'db/custom.db':'')" 2>/dev/null || true)
  [ -n "$SRC" ] && cp "$SRC" "$ROOT/db/custom.db"
}
# normalize the snapshot filename
SNAP=$(ls "$ROOT"/db/kia-*.db 2>/dev/null | head -1 || true)
[ -n "$SNAP" ] && mv "$SNAP" "$ROOT/db/custom.db"

# 3) Portable .env — placeholders ONLY (rotating secrets never leak)
cat > "$ROOT/.env" <<'EOF'
# ── XDrop portable environment ──────────────────────────────────────────────
# All secrets are intentionally BLANK. Generate yours before first boot:
#   openssl rand -hex 32   (one per secret)
NODE_ENV=development
PORT=3000
DATABASE_URL=file:../db/custom.db

BOT_TOKEN=
BOT_USERNAME=XdropmeXbot

OWNER_IDS=
ADMIN_IDS=
WHITELIST_ONLY=false

MCP_TOKEN_SECRET=
A2A_SECRET=
DASHBOARD_KEY=
TELEGRAM_WEBHOOK_SECRET=
RATE_LIMIT_PER_MIN=30
DAILY_SPEND_LIMIT=500000
APPROVAL_TTL_MIN=60

AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-4o-mini

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
EOF

# 4) Safety: refuse to ship real secrets
if grep -qE '^(DASHBOARD_KEY|MCP_TOKEN_SECRET|A2A_SECRET|TELEGRAM_WEBHOOK_SECRET)=[0-9a-f]{32,}' "$ROOT/.env"; then
  echo "✗ REAL SECRET DETECTED in staged .env — aborting." >&2
  exit 1
fi

# 5) Zip it (with the DropAgentX/ parent folder — unzip cleanly)
rm -f "$ZIP"
(cd "$STAGING" && zip -rq "$ZIP" "$NAME" -x "*.DS_Store")

rm -rf "$STAGING"
SIZE=$(du -h "$ZIP" | cut -f1)
FILES=$(unzip -l "$ZIP" | tail -1 | awk '{print $2}')
echo "✅ $ZIP ($SIZE, $FILES files)"
echo "   includes: source + docs + screenshots + db/custom.db + placeholder .env"
