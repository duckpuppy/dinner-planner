# Dinner Planner - Milestones & MVP

## Overview

This document breaks the project into incremental milestones, each delivering usable functionality. The MVP (Milestone 1) focuses on core meal planning and tracking.

---

## Milestone 0: Project Foundation ✅ COMPLETE

**Goal:** Set up development environment and project scaffolding.

**Status:** Completed on 2026-01-16

### Tasks

- [x] Initialize monorepo with Turborepo
- [x] Set up `apps/api` with Fastify + TypeScript
- [x] Set up `apps/web` with Vite + React + TypeScript
- [x] Set up `packages/shared` for shared types/schemas
- [x] Configure ESLint, Prettier, TypeScript
- [x] Set up SQLite + Drizzle ORM with initial schema
- [x] Create database migrations structure
- [x] Set up Docker development environment
- [x] Create basic CI pipeline (lint, type-check, test)
- [x] Document local development setup in README

### Deliverables

- ✅ Working dev environment with hot reload
- ✅ Empty app shell that builds and runs
- ✅ Database schema migrations ready

---

## Milestone 1: MVP - Core Meal Planning ✅ COMPLETE

**Goal:** Basic meal planning, dish management, and preparation tracking. Enough to replace a whiteboard or spreadsheet.

**Status:** Completed on 2026-02-13

### Features

#### Authentication

- [x] Login page
- [x] JWT authentication with refresh tokens
- [x] Logout
- [x] Protected routes

#### Users (Basic)

- [x] Single admin user seeded on first run
- [x] Admin can create additional users
- [x] Users can change their own password

#### Dishes (Basic)

- [x] List all dishes
- [x] Add new dish (name, description, type, basic ingredients as text)
- [x] Edit dish
- [x] View dish detail
- [x] Archive dish

#### Weekly Menu

- [x] View current week
- [x] Navigate to past/future weeks
- [x] Week auto-creates when accessed

#### Dinner Entries

- [x] Set entry type (assembled, fend for self, dining out, custom)
- [x] Select main dish for assembled meals
- [x] Select side dishes (optional)
- [x] Mark entry as completed

#### Preparations (Basic)

- [x] Log preparation (who, notes)
- [x] Auto-complete dinner entry when logged
- [ ] View preparation history on dish (deferred to Milestone 2)

#### Today View

- [x] Display today's dinner
- [x] Quick actions: log preparation
- [ ] View recipe action (deferred to Milestone 2)

#### Basic UI

- [x] Mobile-responsive layout
- [x] Bottom navigation (mobile)
- [x] Light theme only (dark mode in later milestone)

### Out of Scope for MVP

- Ratings
- Structured ingredients
- Offline support
- Search/filtering
- Tags
- User preferences (theme, home view)
- Admin settings (week start day)

### Deliverables

- ✅ Functional web app for planning and tracking dinners
- Docker image for deployment (deferred)
- Basic deployment documentation (deferred)

---

## Milestone 2: Ratings & Dish Enrichment ✅ COMPLETE

**Goal:** Add ratings system and improve dish/recipe management.

**Status:** Completed on 2026-02-13

### Features

#### Ratings

- [x] Rate a preparation (1-5 stars)
- [x] Add note with rating
- [x] Edit own rating
- [x] Delete own rating
- [x] Display ratings on preparation
- [x] Calculate and display aggregate rating per dish

#### Structured Ingredients

- [x] Migrate ingredients from text to structured format
- [x] Add/edit ingredients with quantity, unit, name, notes
- [x] Display formatted ingredient list

#### Tags

- [x] Add tags to dishes
- [x] Filter dishes by tag
- [x] Display tag list with counts

#### Dish Improvements

- [x] Add prep time, cook time, servings fields
- [x] Add source URL field
- [x] Add video URL field
- [x] Search dishes by name/description
- [x] Sort dishes (name, rating, recent, created)

#### History View

- [x] Timeline view of past meals
- [x] Search history
- [x] Filter by date range

### Deliverables

- ✅ Complete rating system
- ✅ Full recipe management with structured data
- ✅ Searchable history

---

## Milestone 3: User Experience Polish ✅ COMPLETE

**Goal:** Add user preferences, admin settings, and UX improvements.

**Status:** Completed on 2026-02-19

### Features

#### User Preferences

- [x] Theme selection (light/dark)
- [x] Dark mode implementation
- [x] Home view preference (today/week)
- [x] Save preferences per user

#### Admin Features

- [x] User management screen (list, edit, delete)
- [x] Change user roles
- [x] Reset user passwords
- [x] App settings screen
- [x] Configure week start day

#### Hard Delete (Admin)

- [x] Admin can permanently delete dishes
- [x] Confirmation dialog
- [x] Handle dishes referenced in history

#### UI Improvements

- [x] Loading skeletons
- [x] Toast notifications
- [x] Error states and messages
- [x] Empty states
- [x] Pull to refresh (mobile)
- [x] Swipe actions on entries

#### Desktop Layout

- [x] Sidebar navigation
- [x] Multi-column layouts
- [x] Larger click targets

### Deliverables

- ✅ Full theme support
- ✅ Complete admin functionality
- ✅ Polished user experience

---

## Milestone 4: Offline Support (PWA) ✅ COMPLETE

**Goal:** Enable offline access to current week's menu and recipes.

**Status:** Completed on 2026-02-19

### Features

#### Service Worker

- [x] Cache static assets (JS, CSS, images)
- [x] App shell caching strategy
- [x] Offline detection

#### Data Caching

- [x] Cache current week's menu in IndexedDB
- [x] Cache referenced dishes/recipes
- [x] Sync endpoint for bulk data fetch

#### Offline Functionality

- [x] View current week offline
- [x] View cached recipes offline
- [x] Offline indicator banner
- [x] Queue changes made offline

#### Sync

- [x] Sync queued changes when online
- [x] Conflict resolution (server wins, notify user)
- [x] Sync status indicator

#### PWA

- [x] Web app manifest
- [x] Install prompt
- [x] App icons

### Deliverables

- ✅ Installable PWA
- ✅ Works offline for current week
- ✅ Reliable sync when back online

---

## Milestone 5: Mobile App (Capacitor) ✅ COMPLETE

**Goal:** Package as native mobile app for app store distribution (optional).

**Status:** Completed on 2026-02-19

### Features

#### Capacitor Integration

- [x] Add Capacitor to project
- [x] Configure iOS build
- [x] Configure Android build
- [x] Native splash screen
- [x] Native app icons

#### Native Features

- [x] Push notification support (infrastructure)
- [x] Haptic feedback
- [x] Native share functionality

#### App Store

- [x] iOS App Store submission materials
- [x] Google Play submission materials
- [x] Privacy policy page

### Deliverables

- ✅ iOS app (TestFlight / App Store)
- ✅ Android app (Play Store)

---

## Milestone 6: Meal Suggestions ✅ COMPLETE

**Goal:** Implement intelligent meal suggestions based on ratings and recency.

**Status:** Completed on 2026-02-19

### Features

#### Suggestion Algorithm

- [x] Weight dishes by aggregate rating
- [x] Penalize recently prepared dishes
- [x] Configurable recency window
- [x] Exclude archived dishes

#### UI

- [x] "Suggest a meal" button in entry editor
- [x] Show suggested dishes with reasoning
- [x] Quick-add from suggestion

#### Refinements

- [x] Filter suggestions by tag
- [x] "Not this" to skip suggestion
- [x] Learn from rejections (optional)

### Deliverables

- ✅ Working meal suggestion feature
- ✅ Suggestions consider ratings and recency

---

## Milestone 7: Grocery Lists ✅ COMPLETE

**Goal:** Generate grocery lists from planned meals.

**Status:** Completed on 2026-02-19

### Features

- [x] Generate list from week's menu
- [x] Aggregate quantities of same ingredients
- [x] Check off items
- [x] Share list (copy, export)
- [x] Unit normalization

---

## Milestone 8: Recipe Import from URL ✅ COMPLETE

**Goal:** Allow users to import recipes directly from URLs by extracting schema.org Recipe structured data.

**Status:** Completed on 2026-02-19

### Features

#### Recipe URL Import

- [x] POST `/api/dishes/import-url` — fetch URL, parse JSON-LD `schema.org/Recipe`, return preview
- [x] Handle errors: non-recipe pages, network failures, missing fields
- [x] "Import from URL" button in DishesPage
- [x] URL input → loading → editable preview → save to DishForm
- [x] Unit tests for parser (valid, invalid, network error cases)

---

## Milestone 9: Planning Enhancements ✅ COMPLETE

**Goal:** Recurring meal patterns and dining out restaurant tracking.

**Status:** Completed on 2026-02-19

### Features

#### Recurring Meal Patterns

- [x] DB: `recurring_patterns` table (day_of_week, type, dish, label)
- [x] CRUD API for patterns
- [x] POST `/api/menus/week/:date/apply-patterns` — apply patterns to empty week entries
- [x] UI: manage patterns (create/edit/delete by day)
- [x] WeekPage: "Apply patterns" button

#### Dining Out Restaurant Tracking

- [x] DB: add `restaurant_name` and `restaurant_notes` to `dinner_entries`
- [x] Update API schema + service
- [x] UI: restaurant name/notes inputs when type is `dining_out`
- [x] Display restaurant name in day card and today view

---

## Milestone 10: Visual & Scaling Enhancements ✅ COMPLETE

**Goal:** Photo uploads for preparations and client-side portion scaling.

**Status:** Completed on 2026-02-19

### Features

#### Photo Uploads

- [x] File storage in `apps/api/data/uploads/`, served at `/uploads/`
- [x] `photos` table linked to preparations
- [x] Upload/delete API endpoints (`@fastify/multipart`)
- [x] Photo grid in preparation detail (HistoryPage)
- [x] Show photos in TodayPage preparation card

#### Portion Scaling

- [x] Servings scaler input in dish detail view
- [x] Client-side quantity recalculation proportional to default servings
- [x] Graceful handling of null quantities

---

## Milestone 11: Test Coverage ✅ COMPLETE

**Goal:** Achieve meaningful automated test coverage across API services and frontend components, especially for features added in M8–M10 that shipped without tests.

**Status:** Completed on 2026-02-20

### Features

#### API Service Tests

- [x] `recipeImport.ts` — unit tests for `parseSchemaOrgRecipe` (valid JSON-LD, `@graph` wrapper, `HowToStep` instructions, duration parsing, servings parsing, keywords, missing/invalid cases)
- [x] `patterns.ts` — unit tests for `applyPatternsToWeek` (no patterns, untouched entries, touched entries skipped, dining_out mapping, deterministic selection)
- [x] `dishes.ts` — unit tests for `getDishes` filters (archived, search, tag), `deleteDish` cascade
- [x] `menus.ts` — unit tests for `getOrCreateWeekMenu`, `updateDinnerEntry` field validation

#### API Integration Tests

- [x] Auth flow: login, refresh, logout
- [x] Patterns CRUD: create, read, update, delete; apply-patterns endpoint
- [x] Recipe import: successful parse, non-recipe URL 422, network error 422
- [x] Dishes: archived filter, hard delete cascade

#### Frontend Component Tests

- [x] `PatternsPage` — renders patterns grouped by day, create/edit/delete flow
- [x] `WeekPage` — dining-out restaurant name/notes inputs, apply-patterns button
- [x] `RecipeImportModal` — URL input, loading state, success/error handling
- [x] `DishForm` — prefill from import, ingredient CRUD

#### Coverage Targets

- [x] API services: 80%+ line coverage
- [x] Frontend components: 70%+ line coverage
- [x] CI gate: fail if coverage drops below thresholds

### Deliverables

- ✅ Comprehensive test suite for all milestones M0–M10
- ✅ Coverage reports in CI output
- ✅ Zero untested critical paths (auth, data mutation, import)

---

## Milestone 12: Security Hardening ✅ COMPLETE

**Goal:** Audit and harden the application against common web vulnerabilities before broader deployment.

**Status:** Completed on 2026-02-20

### Features

#### Rate Limiting

- [x] Rate limit auth endpoints (`/api/auth/login`, `/api/auth/refresh`) — e.g. 10 req/min per IP
- [x] Rate limit recipe import endpoint (`/api/dishes/import-url`) — prevent abuse
- [x] Return `429 Too Many Requests` with `Retry-After` header
- [x] Use `@fastify/rate-limit` plugin

#### Security Headers

- [x] Add `@fastify/helmet` for standard security headers (CSP, X-Frame-Options, HSTS, etc.)
- [x] Configure CSP to allow app assets while blocking inline scripts from third-party origins
- [x] Verify headers in integration tests

#### SSRF Protection (Recipe Import)

- [x] Validate URL against an allow list / deny list before fetching (block `localhost`, `127.x`, `10.x`, `192.168.x`, `169.254.x`, metadata endpoints)
- [x] Enforce `https://` only
- [x] Limit response size (e.g. 5 MB) to prevent memory exhaustion

#### Input Validation Audit

- [x] Audit all API routes for unvalidated fields
- [x] Ensure all text inputs have `maxLength` constraints in Zod schemas
- [x] Verify no raw SQL string interpolation anywhere

#### Auth Security Review

- [x] Confirm refresh token rotation on use (invalidate old token)
- [x] Confirm `httpOnly`, `SameSite=Strict`, `Secure` flags on refresh cookie
- [x] Review JWT secret strength requirements in env validation
- [x] Add `env` validation at startup (fail fast if `JWT_SECRET` is missing or too short)

#### Dependency Audit

- [x] Run `pnpm audit` and resolve all high/critical vulnerabilities
- [x] Add `pnpm audit --audit-level=high` to CI pipeline
- [x] Document accepted low/medium risks

### Deliverables

- ✅ Rate limiting on sensitive endpoints
- ✅ Security headers on all responses
- ✅ SSRF protection on recipe import
- ✅ Clean `pnpm audit` output (high/critical = 0)
- ✅ Auth cookie flags verified correct

---

## Milestone 13: Prep Scheduling & Reminders

**Goal:** Associate day-before prep tasks with planned meals (thawing, slow cooker setup, marinade).

### Features

#### Prep Task Management

- [ ] `prep_tasks` table linked to `dinner_entries` (description, remind_at timestamp, completed bool)
- [ ] API CRUD for prep tasks
- [ ] UI in week/day view to add/check off prep tasks
- [ ] Tomorrow's prep tasks surface in Today view

---

## Milestone 14: Recipe Notes & Cook Log

**Goal:** Track evolving recipe knowledge on each dish — persistent notes that survive across preparations.

### Features

#### Persistent Dish Notes

- [ ] `dish_notes` table (dish_id, note, created_at, created_by)
- [ ] API endpoints to add/list/delete notes
- [ ] Notes section in dish detail UI
- [ ] Option to promote a preparation's free-text notes to a dish note

---

## Milestone 15: Multiple Preparers

**Goal:** Credit multiple people for a single preparation.

### Features

#### Multi-Preparer Support

- [ ] Replace single `prepared_by` field with join table `preparation_preparers` (preparation_id, user_id)
- [ ] Update API and history display
- [ ] Multi-select preparer picker in UI

---

## Milestone 16: Pantry Tracking

**Goal:** Mark ingredients as already in the pantry so the grocery list excludes them.

### Features

#### Pantry Management

- [ ] `pantry_items` table (household-scoped, ingredient name, quantity, expires_at)
- [ ] API CRUD for pantry items
- [ ] Pantry management page
- [ ] Grocery list generation excludes pantry-covered items

---

## Milestone 17: Nutritional Information

**Goal:** Capture and display nutritional data for dishes.

### Features

#### Nutritional Data

- [ ] Extend `dishes` with calories, protein, carbs, fat (per serving, nullable)
- [ ] Auto-populate from schema.org Recipe `nutrition` during URL import
- [ ] Manual entry in DishForm
- [ ] Display in dish detail, scaled by portion scaler

---

## Milestone 18: Dietary Tags & Restrictions

**Goal:** Structured dietary attributes for filtering and user preferences.

### Features

#### Dietary System

- [ ] Predefined tags: vegetarian, vegan, gluten-free, dairy-free, nut-free, low-carb
- [ ] Multi-value field on dishes
- [ ] Filter dishes by dietary tag
- [ ] User dietary preferences stored in settings
- [ ] Suggestion engine respects user dietary preferences

---

## Milestone 19: Planned vs. Actual Tracking

**Goal:** Distinguish tentatively planned meals from confirmed ones.

### Features

#### Entry Status Tracking

- [ ] Add `status` enum to `dinner_entries`: `draft | confirmed | completed`
- [ ] Default new entries to `draft`
- [ ] UI affordance to confirm a plan (week view)
- [ ] Today view highlights unconfirmed entries
- [ ] History and suggestions only count `completed` entries

---

## Future Enhancements (Unscheduled)

- [ ] Video caching from social media
- [ ] Multiple meals per day
- [ ] Data export/import

---

## Summary

| Milestone   | Focus             | Key Deliverable                | Status      |
| ----------- | ----------------- | ------------------------------ | ----------- |
| **0**       | Foundation        | Dev environment, scaffolding   | ✅ Complete |
| **1 (MVP)** | Core Planning     | Basic meal planning app        | ✅ Complete |
| **2**       | Ratings & Recipes | Full recipe + rating system    | ✅ Complete |
| **3**       | Polish            | Themes, admin, UX improvements | ✅ Complete |
| **4**       | Offline / PWA     | Installable PWA, offline view  | ✅ Complete |
| **5**       | Mobile            | Native iOS/Android apps        | ✅ Complete |
| **6**       | Suggestions       | Smart meal suggestions         | ✅ Complete |
| **7**       | Grocery Lists     | Generated, shareable lists     | ✅ Complete |
| **8**       | Recipe Import     | Import from URL (JSON-LD)      | ✅ Complete |
| **9**       | Planning          | Patterns, dining out tracking  | ✅ Complete |
| **10**      | Visual & Scaling  | Photo uploads, portion scaling | ✅ Complete |
| **11**      | Test Coverage     | 80%+ coverage, CI gates        | ✅ Complete |
| **12**      | Security          | Rate limiting, headers, SSRF   | ✅ Complete |
| **13**      | Prep Scheduling   | Day-before prep tasks & reminders      | Planned     |
| **14**      | Cook Log          | Persistent recipe notes per dish       | Planned     |
| **15**      | Multiple Preparers| Credit multiple cooks per meal         | Planned     |
| **16**      | Pantry            | Pantry tracking, smarter grocery lists | Planned     |
| **17**      | Nutrition         | Nutritional info per dish              | Planned     |
| **18**      | Dietary Tags      | Structured dietary attributes          | Planned     |
| **19**      | Planned vs Actual | Draft/confirmed/completed entry states | Planned     |

---

## MVP Acceptance Criteria

The MVP (Milestone 1) is complete when a user can:

1. ✅ Log in with username/password
2. ✅ View this week's dinner menu
3. ✅ Plan a dinner (select dish or mark as fend/dining out/custom)
4. ✅ Add a new dish with name and description
5. ✅ View a dish's recipe
6. ✅ Log who prepared dinner with optional notes
7. ✅ See that logging preparation marks dinner complete
8. ✅ Navigate to view past and future weeks
9. ✅ Use the app on mobile and desktop browsers

**Not required for MVP:** ratings, search, tags, offline, dark mode, admin settings
