# ── XDrop (KIA DropAgentX) — production image ────────────────────────────────
FROM node:20-slim

# OpenSSL is required by Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies FIRST (lockfile-pinned, reproducible, cache-friendly)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source (secrets/db/screenshots excluded via .dockerignore) and build
COPY --chown=node:node . .
RUN npx prisma generate && npm run build

# Default SQLite location — relative URLs resolve against prisma/ (see config).
# Mount a Volume at /app/db (Railway/Fly/compose) so data survives redeploys.
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:../db/custom.db

# Writable DB dir for the non-root runtime user
RUN mkdir -p /app/db && chown -R node:node /app/db
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
