# Dinner Planner

A single-household dinner planning app with weekly menus, recipe management, and meal tracking.

## Features

- **Weekly Menu Planning** - Plan dinners for the week with multiple options (assembled meals, dining out, custom)
- **Recipe Management** - Store dishes with ingredients, instructions, and external links
- **Preparation Tracking** - Log who cooked what and when
- **Ratings** - Rate preparations and track favorites
- **Offline Support** - Access current week's menu offline (coming soon)

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, TanStack Query
- **Backend**: Fastify, TypeScript
- **Database**: SQLite with Drizzle ORM
- **Monorepo**: Turborepo with pnpm workspaces

## Prerequisites

- [mise](https://mise.jdx.dev/) (recommended) or Node.js 22+ and pnpm 9+
- Docker (optional, for containerized deployment)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/duckpuppy/dinner-planner.git
cd dinner-planner

# If using mise (recommended)
mise install

# Install dependencies
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env and set your JWT_SECRET (generate with: openssl rand -base64 32)
```

### 3. Initialize database

```bash
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations
```

### 4. Start development servers

```bash
pnpm dev
```

This starts:

- API server at http://localhost:3000
- Web app at http://localhost:5173

## Project Structure

```
dinner-planner/
├── apps/
│   ├── api/          # Fastify backend
│   │   ├── src/
│   │   │   ├── db/         # Database schema & migrations
│   │   │   ├── routes/     # API routes
│   │   │   ├── services/   # Business logic
│   │   │   └── middleware/ # Auth, validation, etc.
│   │   └── drizzle/        # Migration files
│   │
│   └── web/          # React frontend
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── hooks/
│           ├── lib/
│           └── stores/
│
├── packages/
│   └── shared/       # Shared types & validation schemas
│
├── specs/            # Project specifications
└── docs/             # Documentation
```

## Scripts

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `pnpm dev`         | Start all dev servers              |
| `pnpm build`       | Build all packages                 |
| `pnpm type-check`  | Run TypeScript type checking       |
| `pnpm lint`        | Run ESLint                         |
| `pnpm format`      | Format code with Prettier          |
| `pnpm test`        | Run unit tests with Vitest         |
| `pnpm db:generate` | Generate database migrations       |
| `pnpm db:migrate`  | Run database migrations            |
| `pnpm db:studio`   | Open Drizzle Studio (database GUI) |

## Testing

```bash
# Run all tests
pnpm test

# Run a single package
pnpm --filter @dinner-planner/api test
pnpm --filter @dinner-planner/web test
```

## Deployment

### Docker

```bash
# Build and run
docker compose up -d

# Or build manually
docker build -t dinner-planner .
docker run -d \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e JWT_SECRET=your-secret-here \
  -e ADMIN_PASSWORD=your-admin-password \
  dinner-planner
```

### LXC Container

1. Create an LXC container with Debian/Ubuntu
2. Install Node.js 22+
3. Copy application files to `/opt/dinner-planner`
4. Set up systemd service (see `specs/architecture.md`)
5. Configure Nginx Proxy Manager to proxy to port 3000

## Environment Variables

| Variable             | Description            | Default                 |
| -------------------- | ---------------------- | ----------------------- |
| `NODE_ENV`           | Environment mode       | `development`           |
| `PORT`               | API server port        | `3000`                  |
| `HOST`               | API server host        | `0.0.0.0`               |
| `DATABASE_URL`       | SQLite database path   | `file:./data/dinner.db` |
| `JWT_SECRET`         | Secret for JWT signing | (required)              |
| `JWT_ACCESS_EXPIRY`  | Access token expiry    | `15m`                   |
| `JWT_REFRESH_EXPIRY` | Refresh token expiry   | `7d`                    |
| `ADMIN_USERNAME`     | Initial admin username | `admin`                 |
| `ADMIN_PASSWORD`     | Initial admin password | (required on first run) |
| `CORS_ORIGIN`        | Allowed CORS origin    | `http://localhost:5173` |

## Documentation

See the `specs/` directory for detailed documentation:

- [Requirements](specs/requirements.md) - Features, user stories, data model
- [Architecture](specs/architecture.md) - Technical stack, deployment
- [API Specification](specs/api.md) - REST API endpoints
- [UI Flows](specs/ui-flows.md) - Wireframes and navigation
- [Milestones](specs/milestones.md) - Development roadmap

## License

Private project - All rights reserved
