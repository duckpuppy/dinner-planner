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

# Create prod-only deploy bundle for API (prod node_modules + package.json).
# pnpm deploy does a fresh install (not a copy), and pnpm-workspace.yaml's
# `allowBuilds` config lets bcrypt/better-sqlite3 run their native build during
# this install, so no separate `npm rebuild` step is needed (and would fail:
# node-gyp's node_gyp_bins python3 shim already exists from this install and a
# second `node-gyp rebuild` invocation collides with it — EEXIST).
RUN pnpm deploy --filter=@dinner-planner/api --prod --legacy /app/api-deploy

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

# pnpm deploy --legacy creates node_modules/@dinner-planner/shared as a relative
# symlink (../../../packages/shared) rather than a copy. That relative path
# only resolves correctly from its original location
# (api-deploy/node_modules/@dinner-planner/); the COPY above places it one
# directory level deeper (apps/api/node_modules/@dinner-planner/), so the same
# relative target resolves to a path that's never populated, leaving a
# dangling symlink that crashes the server at boot with ERR_MODULE_NOT_FOUND.
# Replace the symlink with a real copy of the built package so resolution
# doesn't depend on relative-path depth. It has no node_modules of its own;
# its "zod" dependency resolves by Node walking up the directory tree into
# apps/api/node_modules, where --legacy deploy already hoisted a (correctly
# relative, unbroken) symlink to zod. (dinner-wwa)
RUN rm -rf ./apps/api/node_modules/@dinner-planner/shared
COPY --from=builder /app/packages/shared/dist ./apps/api/node_modules/@dinner-planner/shared/dist
COPY --from=builder /app/packages/shared/package.json ./apps/api/node_modules/@dinner-planner/shared/package.json

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
