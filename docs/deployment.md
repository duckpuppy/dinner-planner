# Deployment Guide

## Docker Compose (Recommended)

### Quick Start

```bash
# 1. Copy the example env file
cp .env.example .env

# 2. Edit .env with your values (see Environment Variables below)
#    At minimum set JWT_SECRET and ADMIN_PASSWORD

# 3. Start the container
docker compose up -d

# 4. Access the app at http://localhost:3000
```

### First Run

On the first startup, the server automatically creates an admin account using `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Subsequent starts skip seeding if the user already exists.

### Updates

```bash
docker compose pull   # or rebuild: docker compose build
docker compose up -d
```

Migrations run automatically on startup — no manual steps needed.

## Environment Variables

| Variable              | Required | Default                  | Description                                    |
| --------------------- | -------- | ------------------------ | ---------------------------------------------- |
| `JWT_SECRET`          | **Yes**  | —                        | Secret for signing JWTs. Min 32 chars. Generate with `openssl rand -base64 32` |
| `ADMIN_PASSWORD`      | **Yes**  | —                        | Password for the initial admin account         |
| `ADMIN_USERNAME`      | No       | `admin`                  | Username for the initial admin account         |
| `CORS_ORIGIN`         | No       | `http://localhost:3000`  | Allowed CORS origin. Set to your public URL in production |
| `PORT`                | No       | `3000`                   | Port the API server listens on                 |
| `HOST`                | No       | `0.0.0.0`                | Host the API server binds to                   |
| `DATABASE_URL`        | No       | `file:/app/data/dinner.db` | SQLite database path                         |
| `NODE_ENV`            | No       | `production`             | Set to `development` for debug logging         |
| `JWT_ACCESS_EXPIRY`   | No       | `15m`                    | Access token lifetime                          |
| `JWT_REFRESH_EXPIRY`  | No       | `7d`                     | Refresh token lifetime                         |

### Generating a JWT Secret

```bash
openssl rand -base64 32
```

## Production Checklist

Before going live:

- [ ] `JWT_SECRET` is a strong random value (min 32 chars, not a simple string)
- [ ] `ADMIN_PASSWORD` is a strong password (change it via Profile after first login)
- [ ] `CORS_ORIGIN` is set to your actual domain (`https://dinner.example.com`)
- [ ] HTTPS is configured (via reverse proxy — Nginx, Caddy, etc.)
- [ ] Data volume is mapped to persistent storage
- [ ] Backup procedure is in place (see below)

## Reverse Proxy (Nginx Proxy Manager)

Since the app serves both the API (`/api/`) and the SPA from the same port, a simple proxy is all you need:

- **Upstream**: `http://<container-ip>:3000`
- **No path rewriting** needed — the server handles routing

If using Nginx Proxy Manager, just point a new proxy host at the container's IP:port.

## Backup & Restore

The entire application state is a single SQLite file. The Docker volume `dinner-planner-data` contains `dinner.db`.

### Backup

```bash
# Copy the database file out of the container
docker cp dinner-planner:/app/data/dinner.db ./dinner-backup-$(date +%Y%m%d).db

# Or with docker exec if the container is running
docker exec dinner-planner sqlite3 /app/data/dinner.db ".backup /tmp/backup.db" \
  && docker cp dinner-planner:/tmp/backup.db ./dinner-backup-$(date +%Y%m%d).db
```

### Automated Backup (cron)

```bash
# Add to crontab (daily at 2am, keep 7 days)
0 2 * * * docker cp dinner-planner:/app/data/dinner.db /backups/dinner-$(date +\%Y\%m\%d).db && find /backups -name "dinner-*.db" -mtime +7 -delete
```

### Restore

```bash
# Stop the container
docker compose down

# Restore the backup into the named volume
docker run --rm \
  -v dinner-planner-data:/data \
  -v $(pwd):/backup \
  alpine cp /backup/dinner-backup-20240101.db /data/dinner.db

# Restart
docker compose up -d
```

## Updating

Database migrations run automatically on startup (using Drizzle). Just restart the container after pulling a new image:

```bash
docker compose pull && docker compose up -d
```

## Logs

```bash
# Follow logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100
```

## Health Check

The container exposes a health endpoint:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

Docker Compose checks this every 30 seconds with a 10-second timeout.
