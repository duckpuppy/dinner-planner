# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dinner Planner is a full-stack meal planning application built as a Turborepo monorepo. It helps families plan weekly dinners, track preparations, rate meals, and manage recipes.

Current status: Milestones 0-3 complete (see `specs/milestones.md` for roadmap).

## Architecture

### Monorepo Structure

```
apps/
  api/          Backend Fastify server (TypeScript)
  web/          Frontend React app (Vite + TypeScript)
packages/
  shared/       Shared types and Zod schemas
```

### Tech Stack

**Backend (`apps/api`)**

- Fastify v5 with TypeScript
- SQLite + Drizzle ORM
- JWT authentication (access + refresh tokens)
- Bcrypt for password hashing
- Zod for validation

**Frontend (`apps/web`)**

- React 18 with Vite
- React Router v7 for routing
- TanStack Query for data fetching
- Zustand for client state (auth, theme)
- Tailwind CSS (Catppuccin Macchiato theme)
- Sonner for toast notifications
- Lucide React for icons

**Shared (`packages/shared`)**

- Zod schemas for request/response validation
- TypeScript types exported from schemas

## Development Commands

### Running the App

```bash
# Run both API and web in dev mode with hot reload
pnpm dev

# Run individual apps
pnpm --filter @dinner-planner/api dev
pnpm --filter @dinner-planner/web dev

# Build for production
pnpm build
```

### Code Quality

```bash
# Lint all packages
pnpm lint

# Fix linting errors
pnpm lint:fix

# Type-check all packages
pnpm type-check

# Format code
pnpm format

# Check formatting
pnpm format:check

# Run tests across all packages
pnpm test
```

### Database Management

```bash
# Generate migration files from schema changes
pnpm db:generate

# Run migrations (applies to apps/api/drizzle/data.db)
pnpm db:migrate

# Open Drizzle Studio to view/edit data
pnpm db:studio
```

**Important:** Always run `pnpm db:generate` after modifying `apps/api/src/db/schema.ts`, then `pnpm db:migrate` to apply changes.

## Key Architectural Patterns

### Database Schema and Relationships

The schema (`apps/api/src/db/schema.ts`) models:

- **Users** with roles (admin/member) and preferences (theme, homeView)
- **Dishes** (main/side) with structured ingredients, tags, and metadata
- **Menus** (weekly containers) with **dinner_entries** for each day
- **Preparations** (cooking logs) linked to entries
- **Ratings** (per user, per preparation) with 1-5 stars

Key relationships:

- Dishes → Ingredients (1:N, cascade delete)
- Dishes ↔ Tags (N:N via dish_tags junction)
- Entries → Main dish (1:1, nullable on dish delete)
- Entries ↔ Side dishes (N:N via entry_side_dishes junction)
- Preparations → Ratings (1:N)

**Foreign Key Handling:** When hard-deleting a dish, nullify `dinnerEntries.mainDishId`, delete junction table rows, delete dependent preparations and their ratings. See `apps/api/src/services/dishes.ts:deleteDish()`.

### API Service Layer Pattern

Backend uses a service layer pattern:

- **Routes** (`apps/api/src/routes/*.ts`) define HTTP endpoints and validation
- **Services** (`apps/api/src/services/*.ts`) contain business logic and database queries
- **Middleware** (`apps/api/src/middleware/auth.ts`) handles authentication

Example:

```typescript
// Route calls service
fastify.get('/api/dishes', async () => {
  const dishes = await getDishes({ archived: false });
  return { dishes };
});

// Service handles data access
export async function getDishes(query: DishQueryInput) {
  // Drizzle ORM queries here
}
```

### Authentication Flow

1. **Login:** POST `/api/auth/login` returns access token (15m) + httpOnly refresh token cookie (7d)
2. **Protected routes:** Use `fastify.authenticate` or `fastify.requireAdmin` preHandlers
3. **Refresh:** POST `/api/auth/refresh` uses cookie to issue new access token
4. **Client:** Stores access token in memory (`apps/web/src/lib/api.ts:setAccessToken`)
5. **Auto-refresh:** Frontend calls `/api/auth/refresh` on mount via `checkAuth()`

### Frontend State Management

- **Server state:** TanStack Query with `queryClient` (see `apps/web/src/App.tsx`)
- **Auth state:** Zustand store (`apps/web/src/stores/auth.ts`) persists user object
- **Theme state:** Zustand store (`apps/web/src/stores/theme.ts`) syncs with localStorage and `<html class="dark">`
- **Form state:** React Hook Form (not global)

### API Client Pattern

The frontend API client (`apps/web/src/lib/api.ts`) uses a centralized `request()` helper that:

- Injects `Authorization: Bearer ${accessToken}` header
- Handles 401 errors (clears token)
- Returns typed responses based on Zod schemas from `@dinner-planner/shared`

API namespaces: `auth`, `users`, `dishes`, `menus`, `ratings`, `history`, `settings`

### Import Path Conventions

**Backend:**

- Use `.js` extensions in imports: `import { db } from './db/index.js'`
- CommonJS not supported (all ESM with `"type": "module"`)

**Frontend:**

- Use `@/` alias for `apps/web/src/`: `import { cn } from '@/lib/utils'`

**Shared package:**

- Import as `@dinner-planner/shared`: `import { createDishSchema } from '@dinner-planner/shared'`

### Component Patterns

**Shared Components (`apps/web/src/components/`):**

- `ConfirmDialog` - Reusable confirmation modal for destructive actions
- `StarRating` / `RatingForm` - 1-5 star input and display
- `EmptyState` - Reusable empty state with icon, title, description
- `Layout` - Main app shell with responsive nav (mobile bottom bar, desktop sidebar)

**Page-level components** handle data fetching with TanStack Query and mutation logic.

### Admin Features

Admin-only features are gated by:

1. **Backend:** `fastify.requireAdmin` preHandler (see `apps/api/src/middleware/auth.ts`)
2. **Frontend:** `AdminGuard` component (see `apps/web/src/App.tsx`) redirects non-admins
3. **UI:** Conditional rendering based on `user.role === 'admin'`

Admin routes: `/admin/users`, `/admin/settings`

### Dark Mode Implementation

Dark mode uses:

- CSS custom properties in `apps/web/src/index.css` (light/dark vars)
- Tailwind `darkMode: 'class'` configuration
- Theme store toggles `<html class="dark">` and syncs to `localStorage` + backend API

## Testing

- Vitest for unit tests (both apps)
- Testing Library for React components (`apps/web`)
- Run `pnpm test` from root or individual packages

## Common Workflows

### Adding a New API Endpoint

1. Define Zod schema in `packages/shared/src/schemas.ts`
2. Export type from schema
3. Create service function in `apps/api/src/services/*.ts`
4. Add route in `apps/api/src/routes/*.ts` with schema validation
5. Register route in `apps/api/src/server.ts`
6. Add API client method in `apps/web/src/lib/api.ts`
7. Use with TanStack Query in component

### Adding a Database Column

1. Modify schema in `apps/api/src/db/schema.ts`
2. Run `pnpm db:generate` to create migration
3. Review generated SQL in `apps/api/drizzle/`
4. Run `pnpm db:migrate` to apply
5. Update TypeScript types and service queries

### Creating a New Page

1. Create page component in `apps/web/src/pages/`
2. Add route in `apps/web/src/App.tsx`
3. Add navigation link in `apps/web/src/components/Layout.tsx`
4. Use TanStack Query for data fetching
5. Use Zustand stores for client state (if needed)

## Tooling

- **mise:** Used for managing tool versions (`mise exec -- pnpm <command>`)
- **Beads (bd):** Issue tracking integrated with git (see `.beads/` and `AGENTS.md`)
- **Prettier:** Code formatting (2-space indent)
- **ESLint:** Linting with TypeScript rules and React hooks plugin
