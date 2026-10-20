# ── KIA DropAgentX — production image ────────────────────────────────────────
FROM node:20-slim

# OpenSSL is required by Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npx prisma generate && npm run build

# Default SQLite location (mount a Volume at /app/db on Railway)
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:../db/kia.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
