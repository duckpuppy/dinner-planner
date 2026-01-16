# Dinner Planner - Milestones & MVP

## Overview

This document breaks the project into incremental milestones, each delivering usable functionality. The MVP (Milestone 1) focuses on core meal planning and tracking.

---

## Milestone 0: Project Foundation

**Goal:** Set up development environment and project scaffolding.

### Tasks

- [ ] Initialize monorepo with Turborepo
- [ ] Set up `apps/api` with Fastify + TypeScript
- [ ] Set up `apps/web` with Vite + React + TypeScript
- [ ] Set up `packages/shared` for shared types/schemas
- [ ] Configure ESLint, Prettier, TypeScript
- [ ] Set up SQLite + Drizzle ORM with initial schema
- [ ] Create database migrations structure
- [ ] Set up Docker development environment
- [ ] Create basic CI pipeline (lint, type-check, test)
- [ ] Document local development setup in README

### Deliverables

- Working dev environment with hot reload
- Empty app shell that builds and runs
- Database schema migrations ready

---

## Milestone 1: MVP - Core Meal Planning

**Goal:** Basic meal planning, dish management, and preparation tracking. Enough to replace a whiteboard or spreadsheet.

### Features

#### Authentication

- [ ] Login page
- [ ] JWT authentication with refresh tokens
- [ ] Logout
- [ ] Protected routes

#### Users (Basic)

- [ ] Single admin user seeded on first run
- [ ] Admin can create additional users
- [ ] Users can change their own password

#### Dishes (Basic)

- [ ] List all dishes
- [ ] Add new dish (name, description, type, basic ingredients as text)
- [ ] Edit dish
- [ ] View dish detail
- [ ] Archive dish

#### Weekly Menu

- [ ] View current week
- [ ] Navigate to past/future weeks
- [ ] Week auto-creates when accessed

#### Dinner Entries

- [ ] Set entry type (assembled, fend for self, dining out, custom)
- [ ] Select main dish for assembled meals
- [ ] Select side dishes (optional)
- [ ] Mark entry as completed

#### Preparations (Basic)

- [ ] Log preparation (who, notes)
- [ ] Auto-complete dinner entry when logged
- [ ] View preparation history on dish

#### Today View

- [ ] Display today's dinner
- [ ] Quick actions: view recipe, log preparation, edit

#### Basic UI

- [ ] Mobile-responsive layout
- [ ] Bottom navigation (mobile)
- [ ] Light theme only (dark mode in later milestone)

### Out of Scope for MVP

- Ratings
- Structured ingredients
- Offline support
- Search/filtering
- Tags
- User preferences (theme, home view)
- Admin settings (week start day)

### Deliverables

- Functional web app for planning and tracking dinners
- Docker image for deployment
- Basic deployment documentation

---

## Milestone 2: Ratings & Dish Enrichment

**Goal:** Add ratings system and improve dish/recipe management.

### Features

#### Ratings

- [ ] Rate a preparation (1-5 stars)
- [ ] Add note with rating
- [ ] Edit own rating
- [ ] Delete own rating
- [ ] Display ratings on preparation
- [ ] Calculate and display aggregate rating per dish

#### Structured Ingredients

- [ ] Migrate ingredients from text to structured format
- [ ] Add/edit ingredients with quantity, unit, name, notes
- [ ] Display formatted ingredient list

#### Tags

- [ ] Add tags to dishes
- [ ] Filter dishes by tag
- [ ] Display tag list with counts

#### Dish Improvements

- [ ] Add prep time, cook time, servings fields
- [ ] Add source URL field
- [ ] Add video URL field
- [ ] Search dishes by name/description
- [ ] Sort dishes (name, rating, recent, created)

#### History View

- [ ] Timeline view of past meals
- [ ] Search history
- [ ] Filter by date range

### Deliverables

- Complete rating system
- Full recipe management with structured data
- Searchable history

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

## Milestone 8: Additional Enhancements (Future)

**Goal:** Nice-to-have features for later consideration.

### Possible Features

- [ ] Photo uploads for preparations
- [ ] Multiple preparers per meal
- [ ] Recurring meal patterns ("Taco Tuesday")
- [ ] Notifications/reminders
- [ ] Dietary restriction filtering
- [ ] Portion scaling
- [ ] Video caching from social media
- [ ] Import recipes from URL
- [ ] Multiple meals per day
- [ ] Dining out restaurant tracking
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
