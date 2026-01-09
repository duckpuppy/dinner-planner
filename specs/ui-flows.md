# Dinner Planner - UI Flows & Wireframes

## Navigation Structure

```
┌─────────────────────────────────────────────────────────┐
│                    App Shell                            │
├─────────────────────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐           │
│  │Today│  │Week │  │Dishes│  │History│ │Menu │          │
│  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘           │
│    (configurable home view)              (user menu)    │
└─────────────────────────────────────────────────────────┘
```

### Bottom Navigation (Mobile) / Sidebar (Desktop)

1. **Today** - Today's dinner at a glance
2. **Week** - Weekly menu view
3. **Dishes** - Recipe catalog
4. **History** - Past meals timeline
5. **Menu** (user icon) - Profile, settings, logout

---

## Screen Flows

### 1. Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Login     │────▶│   Home      │     │  Change     │
│   Screen    │     │  (Today)    │     │  Password   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   ▲
                           └───────────────────┘
                           (from user menu)
```

### 2. Main App Flow

```
                    ┌─────────────┐
                    │   Today     │
                    │   View      │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Week View  │    │ Dish Detail │    │    Rate     │
│             │    │             │    │   Dinner    │
└─────────────┘    └─────────────┘    └─────────────┘
         │                 │
         ▼                 ▼
┌─────────────┐    ┌─────────────┐
│ Edit Entry  │    │    Log      │
│   Modal     │    │ Preparation │
└─────────────┘    └─────────────┘
```

---

## Screen Wireframes

### Login Screen

```
┌────────────────────────────────────┐
│                                    │
│         🍽️ Dinner Planner          │
│                                    │
│    ┌────────────────────────┐      │
│    │ Username               │      │
│    └────────────────────────┘      │
│                                    │
│    ┌────────────────────────┐      │
│    │ Password          👁️   │      │
│    └────────────────────────┘      │
│                                    │
│    ┌────────────────────────┐      │
│    │        Log In          │      │
│    └────────────────────────┘      │
│                                    │
└────────────────────────────────────┘
```

---

### Today View (Default Home)

```
┌────────────────────────────────────┐
│ ☰  Today's Dinner        Thu 1/16  │
├────────────────────────────────────┤
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Spaghetti Carbonara    ★4.2 │  │
│  │  ────────────────────────    │  │
│  │  + Garlic Bread              │  │
│  │  + Caesar Salad              │  │
│  └──────────────────────────────┘  │
│                                    │
│  Status: Not yet prepared         │
│                                    │
│  ┌────────────┐  ┌────────────┐   │
│  │ View Recipe│  │Log & Rate  │   │
│  └────────────┘  └────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │      Edit Tonight's Plan   │   │
│  └────────────────────────────┘   │
│                                    │
├────────────────────────────────────┤
│  This Week:                        │
│  ┌──┬──┬──┬──┬──┬──┬──┐           │
│  │Su│Mo│Tu│We│Th│Fr│Sa│           │
│  │✓ │✓ │✓ │✓ │◉ │○ │○ │           │
│  └──┴──┴──┴──┴──┴──┴──┘           │
│  ✓ completed  ◉ today  ○ planned  │
│                                    │
├────────────────────────────────────┤
│ [Today] [Week] [Dishes] [History]  │
└────────────────────────────────────┘
```

**States:**
- **Assembled dinner**: Shows main + sides, recipe button
- **Fend for self**: "Everyone finds their own tonight"
- **Dining out**: "Dining out tonight"
- **Custom**: Shows custom text
- **Not planned**: "No dinner planned" + prominent "Plan Dinner" button

---

### Today View - Alternative States

**Fend for Self:**
```
┌──────────────────────────────────┐
│                                  │
│      🍕 Everyone finds their     │
│         own tonight!             │
│                                  │
│  ┌────────────────────────────┐  │
│  │     Change Tonight's Plan  │  │
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

**Dining Out:**
```
┌──────────────────────────────────┐
│                                  │
│      🍽️ Dining out tonight       │
│                                  │
│  ┌────────────────────────────┐  │
│  │     Change Tonight's Plan  │  │
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

### Week View

```
┌────────────────────────────────────┐
│ ◀  Week of Jan 14, 2024        ▶  │
├────────────────────────────────────┤
│                                    │
│ SUN 14  ✓ Completed                │
│ ┌──────────────────────────────┐   │
│ │ Roast Chicken            ★4.5│   │
│ │ + Mashed Potatoes            │   │
│ └──────────────────────────────┘   │
│                                    │
│ MON 15  ✓ Completed                │
│ ┌──────────────────────────────┐   │
│ │ Tacos                    ★4.0│   │
│ └──────────────────────────────┘   │
│                                    │
│ TUE 16  ● Today                    │
│ ┌──────────────────────────────┐   │
│ │ Spaghetti Carbonara      ★4.2│   │
│ │ + Garlic Bread               │   │
│ └──────────────────────────────┘   │
│                                    │
│ WED 17                             │
│ ┌──────────────────────────────┐   │
│ │ Everyone finds their own     │   │
│ └──────────────────────────────┘   │
│                                    │
│ THU 18                             │
│ ┌──────────────────────────────┐   │
│ │ + Plan dinner                │   │
│ └──────────────────────────────┘   │
│                                    │
│ FRI 19                             │
│ ┌──────────────────────────────┐   │
│ │ Dining Out                   │   │
│ └──────────────────────────────┘   │
│                                    │
│ SAT 20                             │
│ ┌──────────────────────────────┐   │
│ │ + Plan dinner                │   │
│ └──────────────────────────────┘   │
│                                    │
├────────────────────────────────────┤
│ [Today] [Week] [Dishes] [History]  │
└────────────────────────────────────┘
```

**Interactions:**
- Tap entry → Edit Entry modal
- Tap "+ Plan dinner" → Edit Entry modal
- Swipe left/right or arrows → Navigate weeks
- Tap dish name → Dish Detail

---

### Edit Entry Modal

```
┌────────────────────────────────────┐
│ Edit Dinner - Thu Jan 16      ✕   │
├────────────────────────────────────┤
│                                    │
│ Type:                              │
│ ┌────────────────────────────────┐ │
│ │ ○ Planned Meal                 │ │
│ │ ○ Everyone finds their own     │ │
│ │ ○ Dining out                   │ │
│ │ ○ Custom                       │ │
│ └────────────────────────────────┘ │
│                                    │
│ ─── When "Planned Meal" ───        │
│                                    │
│ Main Dish: *                       │
│ ┌────────────────────────────┬──┐  │
│ │ Spaghetti Carbonara        │▼ │  │
│ └────────────────────────────┴──┘  │
│        [Browse Dishes] [+ New]     │
│                                    │
│ Side Dishes:                       │
│ ┌──────────────────────────────┐   │
│ │ ✕ Garlic Bread               │   │
│ │ ✕ Caesar Salad               │   │
│ │ + Add side dish              │   │
│ └──────────────────────────────┘   │
│                                    │
│ ─── When "Custom" ───              │
│                                    │
│ Description:                       │
│ ┌────────────────────────────────┐ │
│ │ Leftovers from Sunday         │ │
│ └────────────────────────────────┘ │
│                                    │
│  ┌──────────┐  ┌──────────────┐   │
│  │  Cancel  │  │     Save     │   │
│  └──────────┘  └──────────────┘   │
│                                    │
└────────────────────────────────────┘
```

---

### Dish Selection Sheet

```
┌────────────────────────────────────┐
│ Select Main Dish              ✕   │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ 🔍 Search dishes...            │ │
│ └────────────────────────────────┘ │
│                                    │
│ Filter: [All] [Italian] [Quick]... │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ Spaghetti Carbonara     ★4.2 │   │
│ │ Last made: 2 weeks ago       │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ Chicken Stir Fry        ★4.5 │   │
│ │ Last made: 1 month ago       │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ Beef Tacos              ★4.0 │   │
│ │ Last made: 3 days ago        │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ Grilled Salmon          ★4.8 │   │
│ │ Never made                   │   │
│ └──────────────────────────────┘   │
│                                    │
│           ... scroll ...           │
│                                    │
└────────────────────────────────────┘
```

---

### Dishes List

```
┌────────────────────────────────────┐
│ Dishes                      [+]   │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ 🔍 Search...                   │ │
│ └────────────────────────────────┘ │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Type: [All ▼]  Tags: [Any ▼]  │ │
│ │ Sort: [Name ▼]                │ │
│ └────────────────────────────────┘ │
│                                    │
│ MAIN DISHES                        │
│ ┌──────────────────────────────┐   │
│ │ Beef Tacos              ★4.0 │   │
│ │ mexican, quick     Made 12x  │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ Chicken Stir Fry        ★4.5 │   │
│ │ asian, healthy     Made 8x   │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ Grilled Salmon          ★4.8 │   │
│ │ seafood, healthy   Made 5x   │   │
│ └──────────────────────────────┘   │
│                                    │
│ SIDE DISHES                        │
│ ┌──────────────────────────────┐   │
│ │ Caesar Salad            ★4.3 │   │
│ │ salad, quick       Made 15x  │   │
│ └──────────────────────────────┘   │
│                                    │
├────────────────────────────────────┤
│ [Today] [Week] [Dishes] [History]  │
└────────────────────────────────────┘
```

---

### Dish Detail

```
┌────────────────────────────────────┐
│ ←  Spaghetti Carbonara    [Edit]  │
├────────────────────────────────────┤
│                                    │
│  ★★★★☆ 4.2  (12 preparations)     │
│  Last made: Jan 14 by Sarah        │
│                                    │
│  Tags: italian, pasta, quick       │
│                                    │
│  ⏱️ Prep: 15 min  🍳 Cook: 20 min  │
│  🍽️ Serves: 4                      │
│                                    │
├────────────────────────────────────┤
│ INGREDIENTS                        │
│                                    │
│  • 1 lb spaghetti                  │
│  • 4 oz pancetta, diced            │
│  • 4 large eggs                    │
│  • 1 cup parmesan, grated          │
│  • 2 cloves garlic, minced         │
│  • Black pepper to taste           │
│  • Salt for pasta water            │
│                                    │
├────────────────────────────────────┤
│ INSTRUCTIONS                       │
│                                    │
│  1. Bring large pot of salted      │
│     water to boil...               │
│                                    │
│  2. While water heats, cook        │
│     pancetta until crispy...       │
│                                    │
│  ... (scrollable) ...              │
│                                    │
├────────────────────────────────────┤
│ 🔗 Source: bonappetit.com/...      │
│ 🎬 Video: [Watch Recipe Video]     │
│                                    │
├────────────────────────────────────┤
│ PREPARATION HISTORY                │
│                                    │
│  Jan 14 - Sarah           ★★★★☆   │
│  "Added extra garlic"              │
│                                    │
│  Dec 28 - Mike            ★★★★★   │
│  "Perfect!"                        │
│                                    │
│  [View all 12 preparations →]      │
│                                    │
├────────────────────────────────────┤
│ [Today] [Week] [Dishes] [History]  │
└────────────────────────────────────┘
```

---

### Add/Edit Dish

```
┌────────────────────────────────────┐
│ ←  New Dish               [Save]  │
├────────────────────────────────────┤
│                                    │
│ Name: *                            │
│ ┌────────────────────────────────┐ │
│ │ Chicken Parmesan               │ │
│ └────────────────────────────────┘ │
│                                    │
│ Type: *                            │
│ ┌──────────┐ ┌──────────┐         │
│ │ ◉ Main   │ │ ○ Side   │         │
│ └──────────┘ └──────────┘         │
│                                    │
│ Description:                       │
│ ┌────────────────────────────────┐ │
│ │ Classic Italian-American       │ │
│ │ comfort food...                │ │
│ └────────────────────────────────┘ │
│                                    │
│ ─────────────────────────────────  │
│ INGREDIENTS                   [+]  │
│                                    │
│ ┌────┬───────┬───────────────┬─┐  │
│ │ 2  │ lbs   │ chicken breast│✕│  │
│ ├────┼───────┼───────────────┼─┤  │
│ │ 1  │ cup   │ breadcrumbs   │✕│  │
│ ├────┼───────┼───────────────┼─┤  │
│ │ 2  │ cups  │ marinara sauce│✕│  │
│ └────┴───────┴───────────────┴─┘  │
│ [+ Add ingredient]                 │
│                                    │
│ ─────────────────────────────────  │
│ INSTRUCTIONS                       │
│ ┌────────────────────────────────┐ │
│ │ 1. Pound chicken breasts...   │ │
│ │                                │ │
│ │ 2. Set up breading station... │ │
│ │                                │ │
│ │ (markdown supported)          │ │
│ └────────────────────────────────┘ │
│                                    │
│ ─────────────────────────────────  │
│ OPTIONAL INFO                      │
│                                    │
│ Prep Time:    ┌────┐ minutes       │
│               │ 20 │               │
│               └────┘               │
│ Cook Time:    ┌────┐ minutes       │
│               │ 30 │               │
│               └────┘               │
│ Servings:     ┌────┐               │
│               │ 4  │               │
│               └────┘               │
│                                    │
│ Source URL:                        │
│ ┌────────────────────────────────┐ │
│ │ https://...                    │ │
│ └────────────────────────────────┘ │
│                                    │
│ Video URL:                         │
│ ┌────────────────────────────────┐ │
│ │ https://...                    │ │
│ └────────────────────────────────┘ │
│                                    │
│ ─────────────────────────────────  │
│ TAGS                               │
│ ┌──────────────────────────────┐   │
│ │ italian  chicken  comfort  + │   │
│ └──────────────────────────────┘   │
│                                    │
└────────────────────────────────────┘
```

---

### Log Preparation & Rate

```
┌────────────────────────────────────┐
│ Log Tonight's Dinner          ✕   │
├────────────────────────────────────┤
│                                    │
│  Spaghetti Carbonara               │
│  Thursday, January 16, 2024        │
│                                    │
│ ─────────────────────────────────  │
│                                    │
│ Who prepared this? *               │
│ ┌────────────────────────────┬──┐  │
│ │ Sarah                      │▼ │  │
│ └────────────────────────────┴──┘  │
│                                    │
│ Preparation notes:                 │
│ ┌────────────────────────────────┐ │
│ │ Used turkey bacon instead of  │ │
│ │ pancetta. Added extra pepper. │ │
│ └────────────────────────────────┘ │
│                                    │
│ ─────────────────────────────────  │
│                                    │
│ Your rating:                       │
│                                    │
│      ★  ★  ★  ★  ☆                │
│           4 stars                  │
│                                    │
│ Rating note:                       │
│ ┌────────────────────────────────┐ │
│ │ Great! Turkey bacon worked    │ │
│ │ really well.                  │ │
│ └────────────────────────────────┘ │
│                                    │
│  ┌──────────┐  ┌──────────────┐   │
│  │  Cancel  │  │  Save & Log  │   │
│  └──────────┘  └──────────────┘   │
│                                    │
│  □ Skip rating (rate later)        │
│                                    │
└────────────────────────────────────┘
```

---

### History View

```
┌────────────────────────────────────┐
│ History                    [🔍]   │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ 🔍 Search meals...             │ │
│ └────────────────────────────────┘ │
│ Filter: [All Time ▼] [All Dishes▼] │
│                                    │
│ JANUARY 2024                       │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ Thu 16                       │   │
│ │ Spaghetti Carbonara     ★4.0 │   │
│ │ Prepared by: Sarah           │   │
│ │ "Used turkey bacon..."       │   │
│ └──────────────────────────────┘   │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ Wed 15                       │   │
│ │ Everyone finds their own     │   │
│ └──────────────────────────────┘   │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ Tue 14                       │   │
│ │ Roast Chicken           ★4.5 │   │
│ │ Prepared by: Mike            │   │
│ │ 2 ratings                    │   │
│ └──────────────────────────────┘   │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ Mon 13                       │   │
│ │ Dining Out                   │   │
│ └──────────────────────────────┘   │
│                                    │
│ ... scroll for more ...            │
│                                    │
│ DECEMBER 2023                      │
│ ...                                │
│                                    │
├────────────────────────────────────┤
│ [Today] [Week] [Dishes] [History]  │
└────────────────────────────────────┘
```

---

### User Menu / Profile

```
┌────────────────────────────────────┐
│ ←  Profile                        │
├────────────────────────────────────┤
│                                    │
│        ┌─────────┐                 │
│        │  👤     │                 │
│        └─────────┘                 │
│         Sarah                      │
│         Member                     │
│                                    │
├────────────────────────────────────┤
│ PREFERENCES                        │
│                                    │
│ Theme                              │
│ ┌──────────┐ ┌──────────┐         │
│ │ ○ Light  │ │ ◉ Dark   │         │
│ └──────────┘ └──────────┘         │
│                                    │
│ Home Screen                        │
│ ┌────────────────────────────┬──┐  │
│ │ Today's Dinner             │▼ │  │
│ └────────────────────────────┴──┘  │
│                                    │
├────────────────────────────────────┤
│ ACCOUNT                            │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Change Password             → │ │
│ └────────────────────────────────┘ │
│                                    │
├────────────────────────────────────┤
│ (Admin only section)               │
│ ADMINISTRATION                     │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Manage Users                → │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ App Settings                → │ │
│ └────────────────────────────────┘ │
│                                    │
├────────────────────────────────────┤
│                                    │
│ ┌────────────────────────────────┐ │
│ │          Log Out               │ │
│ └────────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

---

### Admin: User Management

```
┌────────────────────────────────────┐
│ ←  Manage Users             [+]   │
├────────────────────────────────────┤
│                                    │
│ ┌──────────────────────────────┐   │
│ │ 👤 Sarah                     │   │
│ │    Admin                     │   │
│ │    (you)                     │   │
│ └──────────────────────────────┘   │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ 👤 Mike                   [⋮]│   │
│ │    Member                    │   │
│ └──────────────────────────────┘   │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ 👤 Kids                   [⋮]│   │
│ │    Member                    │   │
│ └──────────────────────────────┘   │
│                                    │
└────────────────────────────────────┘

[⋮] Menu:
  - Edit
  - Change Role
  - Reset Password
  - Delete
```

---

### Admin: App Settings

```
┌────────────────────────────────────┐
│ ←  App Settings                   │
├────────────────────────────────────┤
│                                    │
│ CALENDAR                           │
│                                    │
│ Week starts on:                    │
│ ┌────────────────────────────┬──┐  │
│ │ Sunday                     │▼ │  │
│ └────────────────────────────┴──┘  │
│                                    │
├────────────────────────────────────┤
│ DATA                               │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Export Data                 → │ │
│ └────────────────────────────────┘ │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ View Archived Dishes        → │ │
│ └────────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

---

## Responsive Behavior

### Mobile (< 768px)
- Bottom navigation bar
- Full-screen modals
- Single column layouts
- Collapsible sections in dish detail

### Tablet (768px - 1024px)
- Bottom or side navigation (configurable)
- Sheet modals (partial screen)
- Two-column layouts where appropriate

### Desktop (> 1024px)
- Sidebar navigation
- Modal dialogs
- Multi-column layouts
- Week view shows more detail per day

---

## Theme

### Light Mode
- Background: white/light gray
- Text: dark gray/black
- Accent: primary brand color
- Cards: white with subtle shadow

### Dark Mode
- Background: dark gray (#1a1a1a)
- Text: light gray/white
- Accent: lighter primary color
- Cards: slightly lighter dark (#2a2a2a)

---

## Key Interactions

1. **Quick Actions**
   - Swipe on dinner entry → Quick complete/edit
   - Long press on dish → Quick add to today/week
   - Pull to refresh on any list

2. **Feedback**
   - Toast notifications for actions
   - Skeleton loading states
   - Optimistic updates with rollback on error

3. **Offline Indicators**
   - Banner when offline
   - Queued changes indicator
   - Sync status in user menu
