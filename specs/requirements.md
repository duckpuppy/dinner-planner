# Dinner Planner - Requirements Specification

## Overview

A single-household, multi-user application for planning weekly dinner menus, tracking meal preparations, and rating dishes.

## Core Concepts

### Dinner Types

1. **"Everyone finds their own"** - No planned meal, each person handles their own dinner
2. **"Dining out"** - Eating at a restaurant
3. **Custom text** - Free-form entry (e.g., "Leftovers", "Potluck at neighbor's")
4. **Assembled dinner** - A structured meal consisting of:
   - One main dish (required)
   - Zero or more side dishes (optional)

### Weekly Menu

- A week's worth of dinner plans (7 days)
- **Configurable week start day** (Sunday, Monday, etc.) - admin setting
- Each day has one dinner entry
- Menus can be created, edited, and overridden
- Individual dinners can be marked as "completed"
- **Dinner auto-completes when a preparation is logged**
- **Past menus are archived and viewable**

### Dishes (Recipes)

- Reusable catalog of main dishes and side dishes
- **Full recipe support:**
  - Name
  - Description/summary
  - **Structured ingredients** (quantity, unit, ingredient name) - for grocery list generation
  - Instructions/steps
  - Prep time (optional)
  - Cook time (optional)
  - Servings (optional)
  - External URL links (to recipe sources)
  - **Video links** (social media captures)
    - Store link for later playback
    - *Stretch goal:* Download and cache video locally on server
- **Categories/tags** for organization (cuisine, dietary, etc.)
- **Any user can add or edit dishes**
- **Archive:** available to all users
- **Hard delete:** admin only

### Preparations

A preparation is a specific instance of cooking a dish. Tracks:
- Which dish was prepared
- **Single preparer** (one person credited)
- Date of preparation
- Optional notes (variations from base recipe, substitutions, etc.)
- *Future:* Photo uploads

### Ratings

- Any user can rate a preparation
- Scale: 1-5 stars
- Optional text note for praise/critique
- One rating per user per preparation
- **Ratings are editable after submission**
- **Aggregate rating displayed per dish** (average across all preparations)

---

## Decisions Made

### Users & Authentication

- [x] **Single-household application**
- [x] **Simple username/password authentication** (internal management)
  - Architecture should allow for alternative auth methods later
- [x] **Two roles:**
  - **Admin** - full access, user management, app settings, hard delete
  - **Member** - standard access (add/edit dishes, archive, rate, etc.)

### Permissions Matrix

| Action | Admin | Member |
|--------|-------|--------|
| View menus (current & past) | ✓ | ✓ |
| Create/edit menu entries | ✓ | ✓ |
| Add new dishes | ✓ | ✓ |
| Edit any dish | ✓ | ✓ |
| Archive dishes | ✓ | ✓ |
| **Hard delete dishes** | ✓ | ✗ |
| Log preparations | ✓ | ✓ |
| Rate preparations | ✓ | ✓ |
| Edit own ratings | ✓ | ✓ |
| **Manage users** | ✓ | ✗ |
| **App settings** (week start, etc.) | ✓ | ✗ |

### Technical Platform

- [x] **Web app AND mobile app**
- [x] No specific technology preference - choose best fit
- [x] **Offline capability required:**
  - Current week's menu must be available offline
  - Recipes for current week's dishes available offline

### UI/UX Decisions

- [x] **Primary view: Configurable per user**, default = today's dinner
- [x] **History browsing: Timeline with search** (iterate as needed)
- [x] **Theme: Light/dark toggle with user preference saved**

### Ratings

- [x] Ratings editable after submission
- [x] Aggregate rating displayed per dish

### Meal Suggestions (Future Feature)

- [x] Suggestions based on **ratings** (prefer higher-rated dishes)
- [x] Suggestions based on **recency** (avoid recently prepared dishes)

---

## Deferred Decisions

*To be revisited in future iterations:*

- [ ] How far in advance can menus be planned? (unlimited, 4 weeks, etc.)
- [ ] Can multiple dinners be planned for one day? (e.g., lunch + dinner)
- [ ] Should "dining out" track restaurant name/location?
- [ ] Video caching: which platforms, storage limits, fallback behavior

---

## Future Enhancements

*Documented for later development:*

1. **Grocery list generation** from planned meals (ingredients structure supports this)
2. **Meal suggestions** based on ratings and recency *(confirmed priority)*
3. **Dietary restriction filtering**
4. **Portion scaling** for recipes
5. **Notifications/reminders** (e.g., "What's for dinner tonight?")
6. **Recurring meal patterns** (e.g., "Taco Tuesday")
7. **Video download/caching** from social media *(confirmed stretch goal)*
8. **Photo uploads** for preparations
9. **Multiple preparers** for a single dish

---

## User Stories

### Authentication & Users

- As an admin, I want to create new user accounts for my household
- As an admin, I want to manage user roles (promote/demote)
- As an admin, I want to remove user accounts
- As a user, I want to log in with my username and password
- As a user, I want to change my password
- As a user, I want to set my preferred theme (light/dark)
- As a user, I want to set my preferred home view

### Menu Planning

- As a user, I want to view this week's dinner plan
- As a user, I want to plan dinners for upcoming weeks
- As a user, I want to mark a dinner as "everyone finds their own"
- As a user, I want to mark a dinner as "dining out"
- As a user, I want to enter custom text for a dinner
- As a user, I want to select a main dish and optional sides for a dinner
- As a user, I want to edit a planned dinner
- As a user, I want to mark a dinner as completed
- As a user, I want to view past weeks' menus
- As a user, I want to access the current week's menu offline

### Dish Management

- As a user, I want to browse available dishes
- As a user, I want to search/filter dishes by category or tag
- As a user, I want to view a dish's full recipe
- As a user, I want to add a new dish with structured ingredients
- As a user, I want to edit any dish's recipe
- As a user, I want to add tags/categories to a dish
- As a user, I want to link a recipe video to a dish
- As a user, I want to archive a dish I no longer use
- As an admin, I want to permanently delete a dish
- As a user, I want to access recipes offline for the current week
- As a user, I want to see a dish's aggregate rating

### Preparation Tracking

- As a user, I want to record who prepared tonight's dinner
- As a user, I want the dinner to auto-complete when I log a preparation
- As a user, I want to add notes about how I modified the recipe
- As a user, I want to see the history of when a dish was prepared
- As a user, I want to see who has prepared a dish in the past

### Rating

- As a user, I want to rate tonight's dinner (1-5 stars)
- As a user, I want to leave a note with my rating
- As a user, I want to edit my rating after submission
- As a user, I want to see how others rated a preparation
- As a user, I want to see average ratings for dishes over time
- As a user, I want to see my own rating history

### History & Search

- As a user, I want to browse meal history in a timeline view
- As a user, I want to search past meals by dish name
- As a user, I want to filter history by date range

### Settings (Admin)

- As an admin, I want to set the week start day
- As an admin, I want to configure app-wide settings

### Future: Meal Suggestions

- As a user, I want to get dinner suggestions based on highly-rated dishes
- As a user, I want suggestions to avoid dishes we've had recently

---

## Data Model (Conceptual)

```
User
├── id
├── username
├── password_hash
├── role (admin | member)
├── preferences
│   ├── theme (light | dark)
│   └── home_view (today | week | calendar)
└── timestamps

Dish
├── id
├── name
├── description
├── ingredients[] ─────────────┐
│   ├── quantity               │ Structured for
│   ├── unit                   │ grocery list
│   └── ingredient_name        │ generation
├── instructions (text/steps)
├── prep_time (optional)
├── cook_time (optional)
├── servings (optional)
├── source_url (optional)
├── video_url (optional)
├── tags[]
├── type (main | side)
├── archived (boolean)
├── created_by (user_id)
└── timestamps

WeeklyMenu
├── id
├── week_start_date
└── entries[] ─────────────────┐
                               │
DinnerEntry                    │
├── id                         │
├── menu_id ───────────────────┘
├── date
├── type (fend_for_self | dining_out | custom | assembled)
├── custom_text (for custom type)
├── main_dish_id (for assembled)
├── side_dish_ids[] (for assembled)
├── completed (boolean)
└── timestamps

Preparation
├── id
├── dish_id
├── dinner_entry_id
├── prepared_by (user_id)
├── prepared_date
├── notes (optional)
└── timestamps

Rating
├── id
├── preparation_id
├── user_id
├── stars (1-5)
├── note (optional)
└── timestamps

AppSettings
├── week_start_day (0-6, Sunday-Saturday)
└── other settings...
```
