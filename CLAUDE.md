# dinner-planner

## Project Overview

Issues are tracked with [beads](https://github.com/steveyegge/beads), invoked as `bd`.

## Tech Stack

- **Languages**: TypeScript
- **Frontend**: React 19, Vite 8, TanStack Query v5, Zustand, Tailwind CSS 4, vite-plugin-pwa 2 (Workbox 7), Capacitor 8 (Android)
- **E2E**: Playwright (Chromium) in the `e2e/` workspace package — `pnpm test:e2e`, CI job `E2E (Playwright)`; see `docs/e2e.md`
- **Backend**: Fastify 5, Drizzle ORM, better-sqlite3 (SQLite), Zod, bcrypt, JWT
- **Infrastructure**: Docker, docker-compose, GitHub Actions CI/CD

### Database Migrations

**NEVER hand-write migration SQL files.** Always use drizzle-kit to generate migrations:

1. Edit `apps/api/src/db/schema.ts` with your schema changes
2. Run `pnpm db:generate` — this creates the SQL file, snapshot, and journal entry
3. Verify with `pnpm db:generate` again — should print "No schema changes, nothing to migrate"
4. Commit all files in `apps/api/drizzle/` (SQL, `meta/_journal.json`, `meta/*_snapshot.json`)

**Why:** CI runs `pnpm db:generate` and then applies all migrations to a fresh DB. If a migration was hand-written without a snapshot, drizzle-kit generates a duplicate migration that fails with "duplicate column name". This has caused CI failures multiple times.

## Your Identity

**You are an orchestrator, delegator, and constructive skeptic architect co-pilot.**

- **Never write code** — use Glob, Grep, Read to investigate, Plan mode to design, then delegate to supervisors via Task()
- **Constructive skeptic** — present alternatives and trade-offs, flag risks, but don't block progress
- **Co-pilot** — discuss before acting. Summarize your proposed plan. Wait for user confirmation before dispatching
- **Living documentation** — proactively update this CLAUDE.md to reflect project state, learnings, and architecture

## Why Beads & Worktrees Matter

Beads provide **traceability** (what changed, why, by whom) and worktrees provide **isolation** (changes don't affect main until merged). This matters because:

- Parallel orchestrators can work without conflicts
- Failed experiments are contained and easily discarded
- Every change has an audit trail back to a bead
- User merges via UI after CI passes — no surprise commits

## Worktree & Dispatch Strategy

Beads state is synced via Dolt remote (`bd dolt push` / `bd dolt pull`) — `issues.jsonl` is **not** git-tracked. Worktrees will not automatically see new beads; the orchestrator must manage all beads operations. **Mitigate this by having the orchestrator manage all beads operations — supervisors only write code.**

### When to use each approach

| Scenario                                            | Approach                            |
| --------------------------------------------------- | ----------------------------------- |
| Single-domain task                                  | Feature branch, no worktree         |
| Epic with dependent children (sequential)           | Feature branch, sequential dispatch |
| Epic with independent children (separate file sets) | **Worktree parallel dispatch**      |

### Feature branch dispatch (default)

1. Orchestrator creates feature branch: `git checkout -b {branch}`
2. Dispatch supervisors sequentially (or parallel without `isolation: "worktree"`)
3. Each supervisor commits directly to the feature branch
4. Orchestrator manages all beads operations (create, update, close)

### Worktree parallel dispatch

Use when epic children touch **independent file sets** (e.g., API + frontend + infra).

1. Orchestrator syncs beads before creating worktrees: `bd dolt push`
2. Dispatch supervisors with `isolation: "worktree"`
3. Each worktree gets its own branch — orchestrator merges results
4. Orchestrator manages all beads operations from main worktree

### Supervisor dispatch rules (both approaches)

- DO tell supervisors the exact branch name they're on
- DO tell supervisors "DO NOT switch branches. Commit directly to this branch."
- Orchestrator manages all beads operations (create, update, close) — supervisors never run `bd`

## Quick Fix Escape Hatch

For trivial changes (<10 lines) on a **feature branch**, you can bypass the full bead workflow:

1. `git checkout -b quick-fix-description` (must be off main)
2. Investigate the issue normally
3. Attempt the Edit — hook prompts user for approval
4. User approves → edit proceeds → commit immediately
5. User denies → create bead and dispatch supervisor

**On main/master:** Hard blocked. Must use bead + worktree workflow.
**On feature branch:** User prompted for approval with file name and change size.

**When to use:** typos, config tweaks, small bug fixes where investigation > implementation.
**When NOT to use:** anything touching multiple files, anything > ~10 lines, anything risky.

**Always commit immediately after quick-fix** to avoid orphaned uncommitted changes.

## Investigation Before Delegation

**Lead with evidence, not assumptions.** Before delegating any work:

1. **Read the actual code** — Don't just grep for keywords. Open the file, understand the context.
2. **Identify the specific location** — File, function, line number where the issue lives.
3. **Understand why** — What's the root cause? Don't guess. Trace the logic.
4. **Log your findings** — `bd comments adds add {ID} "INVESTIGATION: ..."` so supervisors have full context.

**Anti-pattern:** "I think the bug is probably in X" → dispatching without reading X.
**Good pattern:** "Read src/foo.ts:142-180. The bug is at line 156 — null check missing."

The supervisor should execute confidently, not re-investigate.

### Hard Constraints

- Never dispatch without reading the actual source file involved
- Never create a bead with a vague description — include file:line references
- No partial investigations — if you can't identify the root cause, say so
- No guessing at fixes — if unsure, investigate more or ask the user

## Workflow

Every task goes through beads. No exceptions (unless user approves a quick fix).

### Standalone (single supervisor)

1. **Investigate deeply** — Read the relevant files (not just grep). Identify the specific line/function.
2. **Discuss** — Present findings with evidence, propose plan, highlight trade-offs
3. **User confirms** approach
4. **Create bead** — `bd create "Task" -d "Details"`
5. **Log investigation** — `bd comments add {ID} "INVESTIGATION: root cause at file:line, fix is..."`
6. **Dispatch** — `Task(subagent_type="{tech}-supervisor", prompt="BEAD_ID: {id}\n\n{brief summary}")`

Dispatch prompts are auto-logged to the bead by a PostToolUse hook.

### Plan Mode (complex features)

Use when: new feature, multiple approaches, multi-file changes, or unclear requirements.

1. EnterPlanMode → explore with Glob/Grep/Read → design in plan file
2. AskUserQuestion for clarification → ExitPlanMode for approval
3. Create bead(s) from approved plan → dispatch supervisors

**Plan → Bead mapping:**

- Single-domain plan → standalone bead
- Cross-domain plan → epic + children with dependencies

## Beads Commands

```bash
bd create "Title" -d "Description"                    # Create task
bd create "Title" -d "..." --type epic                # Create epic
bd create "Title" -d "..." --parent {EPIC_ID}         # Child task
bd create "Title" -d "..." --parent {ID} --deps {ID}  # Child with dependency
bd list                                               # List beads
bd show ID                                            # Details
bd ready                                              # Unblocked tasks
bd update ID --status inreview                        # Mark done
bd close ID                                           # Close
bd dep relate {NEW_ID} {OLD_ID}                       # Link related beads
bd comments adds add ID "Comment text here"                # Add comment to issue
bd comments adds add ID -f /path/to/file                   # Comment from file
bd comments adds list ID                                   # List comments on issue
```

## When to Use Standalone or Epic

| Signals                            | Workflow       |
| ---------------------------------- | -------------- |
| Single tech domain                 | **Standalone** |
| Multiple supervisors needed        | **Epic**       |
| "First X, then Y" in your thinking | **Epic**       |
| DB + API + frontend change         | **Epic**       |

Cross-domain = Epic. No exceptions.

## Epic Workflow

1. `bd create "Feature" -d "..." --type epic` → {EPIC_ID}
2. Create children with `--parent {EPIC_ID}` and `--deps` for ordering
3. `bd ready` to find unblocked children → dispatch ALL ready in parallel
4. Repeat step 3 as children complete
5. `bd close {EPIC_ID}` when all children merged

## Bug Fixes & Follow-Up

**Closed beads stay closed.** For follow-up work:

```bash
bd create "Fix: [desc]" -d "Follow-up to {OLD_ID}: [details]"
bd dep relate {NEW_ID} {OLD_ID}  # Traceability link
```

## Knowledge Base

Search before investigating unfamiliar code: `.beads/memory/recall.sh "keyword"`

Log learnings: `bd comments add {ID} "LEARNED: [insight]"` — captured automatically to `.beads/memory/knowledge.jsonl`

## Supervisors

- node-backend-supervisor
- react-supervisor
- infra-supervisor
- merge-supervisor

## Current State

### Completed milestones: M0–M28 + multi-family, offline APK, video import resilience, kiosk, entry dedupe (all on main)

- M21: First-run setup wizard (`POST /api/setup`, `setupRequired` on health, `SetupPage`)
- M22: Test coverage ≥80% API (88%/80%/84%) and Web (86%/86%/80%)
- M23: Custom grocery items — `customGroceryItems` table; CRUD routes; `AddCustomItemDialog`
- M24: Shared check state + live sync — `groceryChecks` table; toggle/clear endpoints; 5s polling; optimistic updates; per-user tracking
- M25: Grocery organization — `stores` + `ingredientStores` tables; store filter UI; category grouping
- M26: Standing/recurring items — `standingItems` table; full CRUD; `ManageStandingItemsDialog`
- M27: Week planning board — `PlanningBoardPage` + `PlanDayCard`; 7-day card grid; `@dnd-kit/core` drag-to-swap; "Plan next week →" button on `WeekPage`; progress chip; `SuggestionModal` for dish picking
- M28: Video transcript extraction for recipe extraction — yt-dlp `--write-subs`/`--write-auto-subs` (English only, manual preferred over auto-generated); `parseVtt()` + `downloadVideo()` in `apps/api/src/services/videoDownload.ts`; transcript appended (8000-char cap) to the title+description text fed to Ollama in `recipeExtraction.ts`; persisted on `videoJobs.transcript` (migration `0023_windy_rage.sql`). Released v1.17.0.
- Multi-family support (epic dinner-7pt, all 7 children closed): the app is no longer single-tenant.
  - Phase 1 (7pt.1/7pt.2, PRs #247/#248): `families` table; `users.familyId`; JWT payload carries `familyId`; `POST /api/setup` requires `familyName`; `GET/POST/PATCH /api/families`; family section in `AdminUsersPage`.
  - Phase 2 (7pt.4/7pt.5, PRs #252/#254): every data table scoped by `family_id`. Anchors (`dishes`, `weeklyMenus`, `restaurants`) hold `family_id` directly; their cascading children (`dishTags`, `dinnerEntries`, `preparations`, `ratings`, `prepTasks`, `restaurantDishes`, etc.) are scoped transitively via JOIN, not a duplicated column. Orphan tables with no FK path to an anchor (`tags`, `recurringPatterns`, `pantryItems`, `stores`, `customGroceryItems`, `groceryChecks`, `standingItems`) got their own direct `family_id`. `ingredients` has no `family_id` because rows are dish-owned (`ingredients.dish_id` → `dishes.id` ON DELETE cascade) and scoped transitively through the dish, like `dishTags` — it is NOT a global catalog; deleting or copying a dish must include its ingredients (and their `ingredientStores` rows). Cross-family access returns 404, not 403, to avoid disclosing existence of other families' data — this convention is now used throughout the API. Migration pattern for adding a NOT-NULL FK column to a non-empty SQLite table: two-step split (nullable + backfill, then tighten to NOT NULL) — see PRs #247/#252/#254 for reference migrations.
  - **`dinner_entries` exception (dinner-9o1, migrations 0035-0037)**: `dinner_entries` carries its own direct `family_id` (NOT NULL, FK `families`) purely to enforce one entry per family per date via the unique index `dinner_entries_family_date_unique (family_id, date)`. This is a deliberate exception to "cascading children are scoped transitively via JOIN": SQLite cannot enforce uniqueness across a join, and changing the "week starts on" setting used to create overlapping `weekly_menus` that each held their own entry for the same date (day view then picked an empty duplicate). Rules: every insert into `dinner_entries` MUST set `family_id` equal to its menu's `family_id` (seeds and test fixtures included); authorization still goes through the menu JOIN (`entryFamilyId`). `getOrCreateWeekMenu` (`ensureWeekMenu` in `services/menus.ts`) runs on every call in one transaction: it re-parents the family's existing entries for the 7 dates into the requested week's menu, inserts only missing dates, and deletes menus left empty. Date-keyed reads (`getTodayEntry`, kiosk week) look up by `(family_id, date)`, not by menu. Migration 0036 deduped existing data (survivor precedence: has preparations > completed/skipped > has a plan > has sides/prep tasks > newest `updated_at`; children of removed rows are re-pointed to the survivor, identical side dishes/prep-task descriptions collapse). `grocery_checks` are keyed by `week_date`, so check state saved under the old week key is orphaned after a start-day change (not migrated).
  - Phase 3 (7pt.6/7pt.7, PRs #256/#257): `POST /api/families` (reassigns caller into a new family as its admin) now 409s if the caller is the sole admin of a family with other members, to avoid orphaning them (`isSoleAdminOrphaningFamily` in `apps/api/src/services/families.ts`). Frontend "Leave & create new family" confirmation dialog in `AdminUsersPage` requires typing the new family name, lists what's lost, surfaces the 409 inline, and refreshes the session (`useAuthStore.checkAuth()`) + invalidates the entire query cache on success.

### Offline-first native APK + realtime grocery (epic dinner-4kj, PRs #280–#303)

Goal: several shoppers in one store, flaky connectivity, see each other's check-offs within ~1s; offline writes survive restarts and merge on reconnect. Same offline behavior in the PWA.

- **Native transport**: APK origin is `https://localhost`; the bundle bakes `VITE_API_ORIGIN` (`lib/apiOrigin.ts` → `apiUrl()`/`mediaUrl()`; empty on web = same-origin). CapacitorHttp/CapacitorCookies stay **off** (plain WebView fetch, needed for SSE streaming). Requests send `X-Client-Platform: native` + `credentials: 'omit'`; login returns `refreshToken` in the body (no cookie) and refresh/logout take it in the body. Token stored via `@aparajita/capacitor-secure-storage` (`lib/nativeTokenStore.ts`); `allowBackup=false`.
- **CORS**: `CORS_ORIGIN` is a comma-separated list (`apps/api/src/cors.ts`); prod + testing host compose set `https://localhost`. **`methods` must include PUT/PATCH/DELETE** — `@fastify/cors` defaults to GET,HEAD,POST, which silently broke every APK write once (PR #302). Media routes send `Cross-Origin-Resource-Policy: cross-origin`.
- **Sessions**: refresh tokens slide on every refresh (web 7d, native `JWT_REFRESH_EXPIRY_NATIVE` 30d); no rotation. Refresh cookie `maxAge` is in **seconds** (it was ms → ~19-year cookie before #281).
- **Errors/timeouts** (`lib/api.ts`): network failures throw `NetworkError{kind}` (never a fake 401); AbortController timeouts (GET 15s, write 20s, refresh 10s, upload 120s, health 5s).
- **Connectivity** (`lib/connectivity.ts`): `onlineManager` driven by `/health` probes with backoff; on Android the WebView's `navigator.onLine` never changes, so native uses `@capacitor/network` as the probe trigger.
- **Offline session** (`stores/auth.ts`, `lib/sessionSnapshot.ts`): idb `dinner-planner-session` snapshot; cold start with a network error and snapshot < 7d → `sessionMode: 'offline'` with cached data; reconnect refreshes then `resumePausedMutations()`. Query cache max age 7d measured from last server contact. Warm prefetch after online auth (`lib/warmPrefetch.ts`).
- **Offline write queue** (`lib/offlineMutations.ts`, `lib/mutationQueuePersistence.ts`): `setMutationDefaults` for `['offline', …]` keys (grocery check set/clear, custom/standing add/delete, pantry add/delete), `networkMode: 'online'`, FIFO `scope`, retry forever on NetworkError / 3× on 5xx / drop 4xx to the failed store. Persisted to idb `dinner-planner-mutation-queue` (owner-scoped, not app-version-scoped), restored paused in `bindCacheOwner`. UI renders server data + `applyPendingOps` overlay (`lib/pendingOps.ts`). Creates use client UUIDs (server creates are idempotent; deletes always 204). Logout with pending changes asks for confirmation.
- **SSE** (`GET /api/events`, `services/eventBus.ts`, `routes/events.ts`): per-family in-memory bus, 500-event ring buffer, ids `<instanceId>:<seq>`, `Last-Event-ID` replay or `event: reset`, 25s heartbeat, stream ends at token `exp`, `X-Accel-Buffering: no`, closed in `preClose` (not `onClose` — that hangs). Single-process only; scaling out would need a broker. Client: fetch-streaming reader with Bearer (`lib/liveEvents.ts`, `hooks/useLiveEvents.ts`), only while Grocery/Pantry is visible. Verified unbuffered through NPM.
- **Who checked**: `CheckedByChip` initials from `checks[].checkedBy`; no claim state.
- **APK build/CI**: Gradle flavors `prod` and `staging` (AGP forbids flavor names starting with "test"; staging = applicationId suffix `.testing`, "Dinner Planner (Test)"). `android-apk.yml` is a reusable workflow; `android-pr.yml` (debug compile check on Android-touching PRs), `android-testing.yml` (push to `testing` → signed staging APK on the rolling **`testing-apk`** pre-release — not `testing`, which would shadow the branch), `android-release.yml` (`v*` tag → signed prod APK attached to the GitHub Release). Signing secrets `ANDROID_KEYSTORE_BASE64/_PASSWORD`, `ANDROID_KEY_ALIAS/_PASSWORD`; the user holds the keystore. **Gotcha**: GitHub drops job outputs containing a secret's value — the artifact name contains the key alias `dinner-planner`, so publish jobs use the known name, not `needs.build.outputs` (PR #300).
- Follow-ups: dinner-2sp (persist failed-sync store), dinner-f1g (nearby/Bluetooth sync spike, P4).

### Video import resilience (epic dinner-5vx, PRs #293/#298)

yt-dlp stderr is captured and mapped to friendly errors; TikTok `tiktok.com/<code>` links are normalized to `/t/<code>/`; if the download fails, a metadata-only pass still extracts the recipe (job completes with `warning`); Ollama 5xx is retried twice with the body logged; jobs record `extractionStatus`/`extractionError` and expose `rawTitle`/`rawDescription`; `POST /api/jobs/:id/extract` re-runs extraction async (202 + poll, `status: 'extracting'`). `video_jobs` are now family-scoped (`family_id`, nullable for pre-0033 rows; GET was previously unscoped). The import modal shows a review step (prefill from cleaned title/description, "Try extraction again") when no recipe was extracted. Open: yt-dlp in the image reports `JS runtimes: none` (YouTube risk bead).

### Kiosk dashboard (epic dinner-2xi, PRs #294/#299)

`/kiosk?key=dpk_…` — always-on, today-focused display (landscape: hero + week sidebar; portrait: hero + strip), rolls over at local midnight (DST-safe, re-checks every minute/on wake), wake lock, auto-reloads after a deploy (version change on `/health`). Auth is a **read-only display key** (`display_links` table, `dpk_` prefix, sha256-stored, revocable), managed in Admin → Settings → Display links. `GET /api/kiosk/week` accepts only `dpk_` keys (normal routes reject them); it never creates menus; `?key=` is redacted from request logs.

### Active / upcoming milestones

✨ No open milestones. Open beads: dinner-vct (setup wizard unreachable because `seedAdmin` always runs), dinner-aa6 (`tsc -b` re-emits tracked `apps/web/vite.config.d.ts`; turbo appends a block to `AGENTS.md` — revert both before committing), super-admin epics dinner-227 / dinner-2br.

### Grocery system architecture notes

- Grocery list is **derived** from dish ingredients via `getWeekGroceries(weekDate)` in `apps/api/src/services/groceries.ts`
- Check state is **server-side** (`groceryChecks` table), merged **per item, last-write-wins**: rows carry `checked` + `updated_at_ms` (tombstones, not deletes). `PUT /api/grocery/checks {…, clientUpdatedAt}` upserts only if newer (client time clamped to server now); `POST /api/grocery/checks/clear {weekDate, clientUpdatedAt}` unchecks only rows older than the clear. Legacy toggle/DELETE endpoints remain as shims for old clients. GET returns `checkedKeys` + `checks[]` with `checkedBy`.
- Live updates via SSE (`GET /api/events`, see offline/APK section); polling is the fallback (5s, 60s while SSE connected, paused while offline grocery writes are pending)
- Groceries query key is `['groceries', <weekStartDate>]` (`lib/groceryQueryKey.ts`), not the requested date
- Store model: `stores(id, name)` table + `ingredientStores(ingredientId, storeId)` junction; `customGroceryItems` and `standingItems` also have `storeId`
- Custom items keyed as `custom::${id}`, standing items as `standing::${id}` in check state

### Testing → Release deployment pipeline (dinner-8gj, PR #258)

Three-branch model: `main` → `testing` → `release`, each promotion a fast-forward-only merge triggered via workflow, never a local `git` command (so promotion can be done from GitHub's mobile UI).

- `gh workflow run promote.yml -f target=testing` — fast-forwards `main` → `testing`, which triggers `testing.yml` (builds/pushes `ghcr.io/duckpuppy/dinner-planner:testing` + `:testing-<short-sha>`, no version bump, no GitHub Release), which triggers `deploy-testing.yml` on the self-hosted runner.
- `gh workflow run promote.yml -f target=release` — fast-forwards `testing` → `release`, which triggers `release.yml` (now push-triggered off `release`, in addition to its existing `workflow_dispatch`). Version-bump commit lands on `release` (not `main`), avoiding the race where `main` drifts ahead between cutting testing and promoting. After tagging, `release.yml` merges `release` back into `main` (`--no-ff`) so `main`'s `package.json` doesn't go stale — fails loudly on conflict rather than auto-resolving.
- **`APP_VERSION` build identifier**: one string baked in at build time via the Dockerfile `APP_VERSION` build-arg (builder stage: read by vite as `__APP_VERSION__`, shown in the `Layout` sidebar; runner stage: `ENV APP_VERSION` for the API). `testing.yml` passes `testing-<7-char sha>` (matches the image tag), `release.yml` passes plain semver without the `v`, `android-apk.yml` uses `android-<7-char sha>`, and a plain `docker build`/local dev falls back to `<root package.json version>-dev`. The UI renders `vX.Y.Z` only for plain semver; anything else is shown raw in amber. `.git` is dockerignored, so the sha must come in as a build-arg.
- Deliberately **not** triggered on every `main` push — multi-phase epics leave `main` not-yet-feature-complete between phases, so testing/release cuts are always manual, deliberate actions.
- `ci.yml` intentionally does NOT trigger on `testing`/`release` pushes.
- GHCR package is confirmed **public** (verified via anonymous pull token — public packages are storage/bandwidth-unlimited on GitHub), so `release.yml`'s version cleanup was relaxed from keep-3 to keep-15 — rollback headroom is now cheap. Note: image availability doesn't guarantee rollback safety if a DB migration in between isn't backward-compatible; not solved by this pipeline.
- Testing deploys to the **same** self-hosted runner as production (`[self-hosted, dinner-planner]`), as a second `dinner-planner-testing` container on port **3002** (prod stays on 3000; 3001 was already taken by an unrelated `anythingllm` container on that host — discovered live during the first promotion run, port bumped to 3002 both in the host's `compose.yml` and the NPM proxy target), separate data volume, separate `TESTING_JWT_SECRET`/`TESTING_ADMIN_PASSWORD`. Fronted by Nginx Proxy Manager at `dinner-test.duckpuppy.net` → `192.168.0.95:3002`. No CORS/cookie-domain changes were needed for the new subdomain — the app already serves SPA+API same-origin and the refresh-cookie logic already binds to whatever host is used (see cookie-domain gotcha above). Both host services do set `CORS_ORIGIN: https://localhost` for the native APK (see offline/APK section); committed in `~/src/services` as 8c7463c.
- Host-side compose/justfile changes live in `~/src/services` (external to this repo, on the `mediaserver`/`192.168.0.95` host) — `dinner-planner/compose.yml` gained the `dinner-planner-testing` service, `justfile` gained `dinner-planner-testing-deploy`/`-down`/`-logs` (deliberately not wired into the aggregate `up`/`down`/`pull-all` recipes).
- **Pre-promotion check (`scripts/verify-upgrade.sh`)**: before `promote.yml -f target=release`, dry-run pending migrations against a copy of the production DB. `scripts/verify-upgrade.sh --from-host mediaserver` takes an online `better-sqlite3` backup inside the `dinner-planner` container (`--container NAME` to override; the image has no `sqlite3` binary), copies it out, removes the remote temp copies, then runs `apps/api/src/db/migrate.ts` on the copy and checks: row counts unchanged for every pre-existing table (except the documented dedupe decreases in `dinner_entries`/`weekly_menus`/`entry_side_dishes`/`prep_tasks`, which are reported with their counts; also no duplicate `(family_id, date)` entries), every `family_id` column has 0 NULL / 0 dangling / is NOT NULL, `foreign_key_check` and `integrity_check` clean, all migrations recorded, no leftover `__new_*` tables. Use `--db FILE` for a local DB file (copies `-wal`/`-shm` and checkpoints the copy), `--keep` to retain the work dir on PASS (always kept on FAIL). Refuses to run unless `HEAD == origin/testing` (override with `--force`) and there are no uncommitted changes under `apps/api/drizzle` or `apps/api/src/db`. Never modifies the source DB. Non-zero exit on any failure.
- **Post-release super-admin grant**: migration `0031` adds `users.is_super_admin` and leaves every existing user at `is_super_admin=0`, so nobody can use instance-wide user/family management after upgrading until one is granted manually. After the release deploys, run against the production DB: `UPDATE users SET is_super_admin = 1 WHERE username = '<you>';`. The verify script prints this hint along with the current users/roles.
- **APKs follow the same promotions**: the push to `testing` also runs `android-testing.yml` (rolling `testing-apk` pre-release), and the `v*` tag from `release.yml` runs `android-release.yml` (APK attached to the Release). APK failures never block the Docker deploys. `release.yml` has a guard job that skips its own `chore: release` commit and is idempotent if the tag already exists (dinner-cip).
- **Branch protection**: repo ruleset "promotion branches" (id 25329832) on `testing`/`release` blocks deletion and force-push and requires linear history, with no bypass actors. It deliberately does **not** restrict who can push: `RELEASE_PAT` is the owner's own token, so a push restriction couldn't tell workflow pushes from manual ones. All promote/release pushes are fast-forwards, so the ruleset never blocks them. A rollback that needs a force-push means temporarily disabling the ruleset.

### Branch cleanup preferences

When cleaning up branches (local or remote), **preserve**:

- `renovate/*` branches — these are automated dependency update PRs managed by Renovate bot

### Future enhancements (not yet scheduled)

- **Pantry deduction** — "Use from pantry" removes item from shopping list and deducts pantry quantity. ⚠️ Design note: recipe quantity ≠ purchase quantity for proteins/produce (recipe says "2 lbs chicken", user buys "2 packs ≈ 2.5 lbs"). Recommended approach: pantry tracks shelf-stable items precisely; proteins/produce use a boolean "have it / don't have it" rather than measured quantity. Grocery → pantry auto-add needs quantity confirmation UI or the pantry will always be inaccurate for fresh items.
- **Automatic dietary tagging** — infer dietary tags from nutrition fields when saved. Configurable thresholds (e.g. <35g carbs → Low-Carb, <300 calories → Low-Calorie, 0g meat + dairy → Vegan). Should be opt-in per tag so manual overrides are respected.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
