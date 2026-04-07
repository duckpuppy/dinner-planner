# Build stage
FROM node:24-alpine AS builder

# Build tools for native modules (bcrypt, better-sqlite3)
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including dev)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build all packages
RUN pnpm build

# Rebuild native modules against the current Node.js ABI (build tools available here)
RUN cd apps/api && npm rebuild bcrypt better-sqlite3

# Create prod-only deploy bundle for API (prod node_modules + package.json)
# --legacy required for pnpm v10 without inject-workspace-packages
RUN pnpm deploy --filter=@dinner-planner/api --prod --legacy /app/api-deploy

# Rebuild native modules in the deploy directory (pnpm deploy does a fresh install,
# not a copy, so the rebuild above doesn't carry over)
RUN cd /app/api-deploy && npm rebuild better-sqlite3 bcrypt

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 dinner-planner

# Video download tools
RUN apk add --no-cache ffmpeg python3 \
  && wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp

# Copy prod deploy bundle into workspace-relative path so static file resolution works.
# API server.ts uses: join(__dirname, '../../web/dist')
# __dirname = /app/apps/api/dist → ../../web/dist = /app/apps/web/dist
COPY --from=builder /app/api-deploy/node_modules ./apps/api/node_modules
COPY --from=builder /app/api-deploy/package.json ./apps/api/package.json

# Copy compiled API and migration files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

# Copy pre-built frontend at the path the API expects
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Create data directory and fix permissions
RUN mkdir -p /app/data /app/data/videos /app/data/uploads && \
    chown -R dinner-planner:nodejs /app && \
    chmod -R go+rX /app && \
    chmod -R u+w /app/data

USER dinner-planner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/app/data/dinner.db

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "cd /app/apps/api && node dist/db/migrate.js && node dist/server.js"]
