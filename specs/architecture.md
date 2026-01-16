# Dinner Planner - Technical Architecture

## Requirements Summary

- Web app + Mobile app (iOS/Android)
- Offline support for current week's menu + recipes
- Simple username/password authentication
- Single-household deployment
- Light/dark theme support
- Future: grocery list generation, meal suggestions

---

## Architecture Options

### Option A: Progressive Web App (PWA) + Native Wrapper

**Approach:** Build a responsive web app with PWA capabilities, optionally wrap with Capacitor for app store distribution.

```
┌─────────────────────────────────────────┐
│           Client (PWA)                  │
│  ┌─────────────────────────────────┐    │
│  │   React / Vue / Svelte          │    │
│  │   + Service Worker (offline)    │    │
│  │   + IndexedDB (local cache)     │    │
│  └─────────────────────────────────┘    │
│         Optional: Capacitor             │
│         (iOS/Android wrapper)           │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           Backend API                   │
│  ┌─────────────────────────────────┐    │
│  │   Node.js / Python / Go         │    │
│  │   REST or GraphQL               │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │   PostgreSQL / SQLite           │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Pros:**

- Single codebase for web + mobile
- PWA gives offline support out of the box
- Easier to develop and maintain
- Can be installed on home screen without app stores
- Capacitor allows app store distribution if desired later

**Cons:**

- Native features slightly limited vs true native
- iOS PWA support has some quirks (improving)

---

### Option B: React Native / Expo

**Approach:** Use React Native with Expo for mobile-first development, with Expo Web for browser support.

```
┌─────────────────────────────────────────┐
│     React Native + Expo                 │
│  ┌─────────────────────────────────┐    │
│  │   Shared React Native code      │    │
│  │   Expo Router (navigation)      │    │
│  │   WatermelonDB (offline sync)   │    │
│  └─────────────────────────────────┘    │
│         │           │          │        │
│        iOS      Android       Web       │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           Backend API                   │
└─────────────────────────────────────────┘
```

**Pros:**

- True native mobile experience
- Single codebase across all platforms
- Expo simplifies builds and deployment
- Strong offline-first libraries available
- Large ecosystem and community

**Cons:**

- Expo Web not as mature as traditional web frameworks
- Slightly more complex setup than pure web
- Some web-specific optimizations harder

---

### Option C: Flutter

**Approach:** Use Flutter for cross-platform development (iOS, Android, Web).

```
┌─────────────────────────────────────────┐
│              Flutter                    │
│  ┌─────────────────────────────────┐    │
│  │   Dart codebase                 │    │
│  │   Riverpod / Bloc (state)       │    │
│  │   Drift/Isar (local DB)         │    │
│  └─────────────────────────────────┘    │
│         │           │          │        │
│        iOS      Android       Web       │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           Backend API                   │
└─────────────────────────────────────────┘
```

**Pros:**

- Excellent cross-platform consistency
- Strong offline support with local databases
- Good performance
- Material Design and Cupertino widgets built-in

**Cons:**

- Dart language (different from typical web stack)
- Flutter Web bundle sizes can be large
- Smaller ecosystem than React

---

## Recommendation: Option A (PWA + Capacitor)

For a single-household app with your requirements, I recommend **Option A** for these reasons:

1. **Simplicity**: One web codebase, familiar technologies
2. **Offline-first**: PWA + IndexedDB handles offline beautifully
3. **Flexibility**: Works in browser immediately, can add app store later via Capacitor
4. **Maintenance**: Easier to maintain for a personal/household project
5. **Development speed**: Faster iteration with web technologies

---

## Proposed Stack

### Frontend

| Component          | Choice                                    | Rationale                                            |
| ------------------ | ----------------------------------------- | ---------------------------------------------------- |
| **Framework**      | React 18+                                 | Widely used, excellent ecosystem, hooks for state    |
| **Build tool**     | Vite                                      | Fast builds, excellent DX                            |
| **Routing**        | React Router v6                           | Standard, well-documented                            |
| **State**          | TanStack Query + Zustand                  | Query for server state + cache, Zustand for UI state |
| **Offline**        | Service Worker + IndexedDB (via Dexie.js) | PWA standard, Dexie simplifies IndexedDB             |
| **UI Components**  | shadcn/ui + Tailwind CSS                  | Accessible, customizable, great theming support      |
| **Forms**          | React Hook Form + Zod                     | Performant forms with type-safe validation           |
| **Mobile wrapper** | Capacitor (optional)                      | For app store distribution if needed                 |

### Backend

| Component      | Choice                      | Rationale                                                              |
| -------------- | --------------------------- | ---------------------------------------------------------------------- |
| **Runtime**    | Node.js 20+                 | JavaScript everywhere, large ecosystem                                 |
| **Framework**  | Fastify                     | Fast, low overhead, excellent TypeScript support                       |
| **API Style**  | REST                        | Simpler than GraphQL for this scope, easier caching                    |
| **Validation** | Zod                         | Share schemas with frontend                                            |
| **Database**   | SQLite (via better-sqlite3) | Simple deployment, no separate DB server, perfect for single-household |
| **ORM**        | Drizzle ORM                 | Type-safe, lightweight, great SQLite support                           |
| **Auth**       | Custom JWT                  | Simple token-based auth, bcrypt for passwords                          |

### Why SQLite?

For a single-household app:

- No separate database server to manage
- Single file, easy backup
- Excellent performance for this scale
- Can migrate to PostgreSQL later if needed

### Project Structure

```
dinner-planner/
├── apps/
│   ├── web/                 # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── stores/
│   │   │   └── types/
│   │   ├── public/
│   │   └── package.json
│   │
│   └── api/                 # Fastify backend
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── db/
│       │   ├── middleware/
│       │   └── types/
│       ├── drizzle/         # Migrations
│       └── package.json
│
├── packages/
│   └── shared/              # Shared types & validation schemas
│       ├── src/
│       │   ├── schemas/     # Zod schemas
│       │   └── types/       # TypeScript types
│       └── package.json
│
├── specs/                   # Specifications (current)
├── docs/                    # Documentation
├── package.json             # Workspace root
└── turbo.json               # Turborepo config (monorepo)
```

### Monorepo with Turborepo

Using a monorepo allows:

- Shared types between frontend and backend
- Shared validation schemas (Zod)
- Coordinated builds and deployments
- Single repository for entire project

---

## Offline Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend                             │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │  TanStack   │───▶│   Dexie.js  │───▶│  IndexedDB │  │
│  │   Query     │    │  (wrapper)  │    │  (browser) │  │
│  └─────────────┘    └─────────────┘    └────────────┘  │
│         │                                               │
│         │ Online: fetch from API                        │
│         │ Offline: serve from IndexedDB                 │
│         ▼                                               │
│  ┌─────────────┐                                        │
│  │   Service   │  Caches static assets                  │
│  │   Worker    │  Handles offline detection             │
│  └─────────────┘                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼ (when online)
┌─────────────────────────────────────────────────────────┐
│                    Backend API                          │
└─────────────────────────────────────────────────────────┘
```

**Sync Strategy:**

1. On app load, fetch current week's menu + related recipes
2. Store in IndexedDB via Dexie.js
3. TanStack Query checks IndexedDB first, then API
4. Service Worker caches static assets (JS, CSS, images)
5. When offline, app serves entirely from local cache
6. When back online, sync any queued changes

---

## Authentication Flow

```
┌─────────┐     POST /auth/login      ┌─────────┐
│ Client  │ ────────────────────────▶ │   API   │
│         │   { username, password }  │         │
│         │                           │         │
│         │ ◀──────────────────────── │         │
│         │   { accessToken,          │         │
│         │     refreshToken,         │         │
│         │     user }                │         │
└─────────┘                           └─────────┘

Tokens:
- Access token: short-lived (15 min), stored in memory
- Refresh token: longer-lived (7 days), stored in httpOnly cookie
- Auto-refresh before expiry
```

---

## Deployment

### Target Environment

- **Host**: Proxmox server
- **Container**: LXC container or Docker container (flexible)
- **Reverse Proxy**: Nginx Proxy Manager (handles SSL, domain routing)
- **Domain**: Custom domain (managed by NPM)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Proxmox Host                            │
│                                                             │
│  ┌─────────────────────┐    ┌────────────────────────────┐  │
│  │  Nginx Proxy Manager│    │  Dinner Planner (LXC/Docker)│  │
│  │  (separate LXC)     │    │                            │  │
│  │                     │    │  ┌──────────────────────┐  │  │
│  │  yourdomain.com ────────▶│  │  Node.js (Fastify)   │  │  │
│  │  :443 (SSL)         │    │  │  - API server        │  │  │
│  │                     │    │  │  - Serves static web │  │  │
│  └─────────────────────┘    │  │  - Port 3000         │  │  │
│                             │  └──────────────────────┘  │  │
│                             │  ┌──────────────────────┐  │  │
│                             │  │  SQLite database     │  │  │
│                             │  │  /data/dinner.db     │  │  │
│                             │  └──────────────────────┘  │  │
│                             └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Option A: Docker Container

```yaml
# docker-compose.yml
version: '3.8'

services:
  dinner-planner:
    build: .
    container_name: dinner-planner
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data # SQLite database
      - ./uploads:/app/uploads # Future: video cache, photos
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:/app/data/dinner.db
      - JWT_SECRET=${JWT_SECRET}
```

### Option B: LXC Container (Direct Install)

For LXC, a simple install script can:

1. Install Node.js 20+
2. Clone/copy application files
3. Set up systemd service
4. Configure data directory

```bash
# /etc/systemd/system/dinner-planner.service
[Unit]
Description=Dinner Planner
After=network.target

[Service]
Type=simple
User=dinner-planner
WorkingDirectory=/opt/dinner-planner
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:/var/lib/dinner-planner/dinner.db

[Install]
WantedBy=multi-user.target
```

### Nginx Proxy Manager Configuration

In NPM, create a proxy host:

- **Domain**: `dinner.yourdomain.com` (or similar)
- **Forward Hostname/IP**: LXC/container IP
- **Forward Port**: 3000
- **SSL**: Request new certificate (Let's Encrypt)
- **Force SSL**: Yes
- **Websockets Support**: Enable (for future real-time features)

### Backup Strategy

```bash
# Simple backup - just copy the SQLite file
cp /path/to/dinner.db /backup/dinner-$(date +%Y%m%d).db

# Or use SQLite's backup command for consistency
sqlite3 /path/to/dinner.db ".backup '/backup/dinner-$(date +%Y%m%d).db'"
```

---

## Decisions Made

- [x] **Language**: TypeScript throughout (frontend + backend + shared)
- [x] **UI Library**: shadcn/ui + Tailwind CSS
- [x] **Deployment**: Proxmox (LXC or Docker)
- [x] **Reverse Proxy**: Nginx Proxy Manager (SSL, domain)
- [x] **Database**: SQLite (single file, easy backup)
