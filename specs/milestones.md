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

## Milestone 3: User Experience Polish

**Goal:** Add user preferences, admin settings, and UX improvements.

### Features

#### User Preferences

- [ ] Theme selection (light/dark)
- [ ] Dark mode implementation
- [ ] Home view preference (today/week)
- [ ] Save preferences per user

#### Admin Features

- [ ] User management screen (list, edit, delete)
- [ ] Change user roles
- [ ] Reset user passwords
- [ ] App settings screen
- [ ] Configure week start day

#### Hard Delete (Admin)

- [ ] Admin can permanently delete dishes
- [ ] Confirmation dialog
- [ ] Handle dishes referenced in history

#### UI Improvements

- [ ] Loading skeletons
- [ ] Toast notifications
- [ ] Error states and messages
- [ ] Empty states
- [ ] Pull to refresh (mobile)
- [ ] Swipe actions on entries

#### Desktop Layout

- [ ] Sidebar navigation
- [ ] Multi-column layouts
- [ ] Larger click targets

### Deliverables

- Full theme support
- Complete admin functionality
- Polished user experience

---

## Milestone 4: Offline Support (PWA)

**Goal:** Enable offline access to current week's menu and recipes.

### Features

#### Service Worker

- [ ] Cache static assets (JS, CSS, images)
- [ ] App shell caching strategy
- [ ] Offline detection

#### Data Caching

- [ ] Cache current week's menu in IndexedDB
- [ ] Cache referenced dishes/recipes
- [ ] Sync endpoint for bulk data fetch

#### Offline Functionality

- [ ] View current week offline
- [ ] View cached recipes offline
- [ ] Offline indicator banner
- [ ] Queue changes made offline

#### Sync

- [ ] Sync queued changes when online
- [ ] Conflict resolution (server wins, notify user)
- [ ] Sync status indicator

#### PWA

- [ ] Web app manifest
- [ ] Install prompt
- [ ] App icons

### Deliverables

- Installable PWA
- Works offline for current week
- Reliable sync when back online

---

## Milestone 5: Mobile App (Capacitor)

**Goal:** Package as native mobile app for app store distribution (optional).

### Features

#### Capacitor Integration

- [ ] Add Capacitor to project
- [ ] Configure iOS build
- [ ] Configure Android build
- [ ] Native splash screen
- [ ] Native app icons

#### Native Features

- [ ] Push notification support (infrastructure)
- [ ] Haptic feedback
- [ ] Native share functionality

#### App Store

- [ ] iOS App Store submission materials
- [ ] Google Play submission materials
- [ ] Privacy policy page

### Deliverables

- iOS app (TestFlight / App Store)
- Android app (Play Store)

---

## Milestone 6: Meal Suggestions

**Goal:** Implement intelligent meal suggestions based on ratings and recency.

### Features

#### Suggestion Algorithm

- [ ] Weight dishes by aggregate rating
- [ ] Penalize recently prepared dishes
- [ ] Configurable recency window
- [ ] Exclude archived dishes

#### UI

- [ ] "Suggest a meal" button in entry editor
- [ ] Show suggested dishes with reasoning
- [ ] Quick-add from suggestion

#### Refinements

- [ ] Filter suggestions by tag
- [ ] "Not this" to skip suggestion
- [ ] Learn from rejections (optional)

### Deliverables

- Working meal suggestion feature
- Suggestions consider ratings and recency

---

## Milestone 7: Grocery Lists (Future)

**Goal:** Generate grocery lists from planned meals.

### Features

- [ ] Generate list from week's menu
- [ ] Aggregate quantities of same ingredients
- [ ] Check off items
- [ ] Share list (copy, export)
- [ ] Unit normalization

---

## Milestone 8: Recipe Import from URL

**Goal:** Allow users to import recipes directly from URLs by extracting schema.org Recipe structured data.

### Features

#### Recipe URL Import

- [ ] POST `/api/dishes/import-url` — fetch URL, parse JSON-LD `schema.org/Recipe`, return preview
- [ ] Handle errors: non-recipe pages, network failures, missing fields
- [ ] "Import from URL" button in DishesPage
- [ ] URL input → loading → editable preview → save to DishForm
- [ ] Unit tests for parser (valid, invalid, network error cases)

---

## Milestone 9: Planning Enhancements

**Goal:** Recurring meal patterns and dining out restaurant tracking.

### Features

#### Recurring Meal Patterns

- [ ] DB: `recurring_patterns` table (day_of_week, type, dish, label)
- [ ] CRUD API for patterns
- [ ] POST `/api/menus/week/:date/apply-patterns` — apply patterns to empty week entries
- [ ] UI: manage patterns (create/edit/delete by day)
- [ ] WeekPage: "Apply patterns" button

#### Dining Out Restaurant Tracking

- [ ] DB: add `restaurant_name` and `restaurant_notes` to `dinner_entries`
- [ ] Update API schema + service
- [ ] UI: restaurant name/notes inputs when type is `dining_out`
- [ ] Display restaurant name in day card and today view

---

## Milestone 10: Visual & Scaling Enhancements

**Goal:** Photo uploads for preparations and client-side portion scaling.

### Features

#### Photo Uploads

- [ ] File storage in `apps/api/data/uploads/`, served at `/uploads/`
- [ ] `photos` table linked to preparations
- [ ] Upload/delete API endpoints (`@fastify/multipart`)
- [ ] Photo grid in preparation detail (HistoryPage)
- [ ] Show photos in TodayPage preparation card

#### Portion Scaling

- [ ] Servings scaler input in dish detail view
- [ ] Client-side quantity recalculation proportional to default servings
- [ ] Graceful handling of null quantities

---

## Future Enhancements (Unscheduled)

- [ ] Multiple preparers per meal
- [ ] Notifications/reminders
- [ ] Dietary restriction filtering
- [ ] Video caching from social media
- [ ] Multiple meals per day
- [ ] Data export/import

---

## Summary

| Milestone   | Focus             | Key Deliverable                |
| ----------- | ----------------- | ------------------------------ |
| **0**       | Foundation        | Dev environment, scaffolding   |
| **1 (MVP)** | Core Planning     | Basic meal planning app        |
| **2**       | Ratings & Recipes | Full recipe + rating system    |
| **3**       | Polish            | Themes, admin, UX improvements |
| **4**       | Offline           | PWA with offline support       |
| **5**       | Mobile            | Native iOS/Android apps        |
| **6**       | Suggestions       | Smart meal suggestions         |
| **7+**      | Future            | Grocery lists, photos, etc.    |

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
