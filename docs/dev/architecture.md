# Architecture notes

Contributor-facing design decisions, invariants and gotchas that are not obvious from the code. For running the app see [deployment](../deployment.md); for the HTTP API see [api](../api.md).

## Multi-family data scoping

- Every user belongs to one family (`users.family_id`; the JWT carries `familyId`).
- The anchor tables `dishes`, `weekly_menus` and `restaurants` hold `family_id` directly.
- Cascading children (`dish_tags`, `preparations`, `ratings`, `prep_tasks`, `restaurant_dishes`, and so on) are scoped transitively via JOIN, not a duplicated column.
- Orphan tables with no FK path to an anchor (`tags`, `recurring_patterns`, `pantry_items`, `stores`, `custom_grocery_items`, `grocery_checks`, `standing_items`, `video_jobs`) have a direct `family_id`. `video_jobs.family_id` is nullable for rows from before migration 0033.
- `ingredients` has no `family_id`. Its rows are dish-owned (`ingredients.dish_id` → `dishes.id`, ON DELETE cascade). It is NOT a global catalog: deleting or copying a dish must include its ingredients and their `ingredient_stores` rows.
- Cross-family access returns 404, not 403, so the existence of other families' data is not disclosed. This holds API-wide.
- `POST /api/families` (moves the caller into a new family as its admin) returns 409 if the caller is the sole admin of a family that has other members (`isSoleAdminOrphaningFamily` in `apps/api/src/services/families.ts`).
- Migration 0031 adds `users.is_super_admin` with every existing user at 0; see [Post-release super-admin grant](release-pipeline.md#post-release-super-admin-grant).

### dinner_entries exception (dinner-9o1, migrations 0035–0037)

`dinner_entries` carries its own direct `family_id` (NOT NULL, FK `families`), purely to enforce one entry per family per date via the unique index `dinner_entries_family_date_unique (family_id, date)`. This deliberately breaks the "children are scoped via JOIN" rule: SQLite cannot enforce uniqueness across a join, and changing the "week starts on" setting used to create overlapping `weekly_menus` that each held their own entry for the same date (the day view then picked an empty duplicate).

- Every insert into `dinner_entries` MUST set `family_id` equal to its menu's `family_id`, seeds and test fixtures included. Authorization still goes through the menu JOIN (`entryFamilyId`).
- `ensureWeekMenu` in `services/menus.ts` (behind `getOrCreateWeekMenu`) runs in one transaction on every call. It re-parents the family's existing entries for the 7 dates into the requested week's menu, inserts only the missing dates, and deletes menus left empty.
- Date-keyed reads (`getTodayEntry`, kiosk week) look up by `(family_id, date)`, not by menu.
- Migration 0036 deduped existing data. Survivor precedence: has preparations > completed/skipped > has a plan > has sides/prep tasks > newest `updated_at`. Children of removed rows are re-pointed to the survivor, and identical side dishes and prep-task descriptions collapse.
- `grocery_checks` are keyed by `week_date`, so check state saved under the old week key is orphaned after a start-day change. This is not migrated.

### Migration pattern: NOT-NULL FK on a non-empty SQLite table

Use two migrations: (1) add the column nullable and backfill, (2) tighten it to NOT NULL. Reference migrations: PRs #247, #252, #254. Generate them with drizzle-kit only (see CLAUDE.md).

## Grocery list and check state

- The grocery list is **derived** from dish ingredients via `getWeekGroceries(weekDate)` in `apps/api/src/services/groceries.ts`.
- Check state is **server-side** (`grocery_checks`), merged **per item, last-write-wins**: rows carry `checked` + `updated_at_ms` (tombstones, not deletes).
  - `PUT /api/grocery/checks {…, clientUpdatedAt}` upserts only if newer (client time clamped to server now).
  - `POST /api/grocery/checks/clear {weekDate, clientUpdatedAt}` unchecks only rows older than the clear.
  - Legacy toggle/DELETE endpoints remain as shims for old clients.
  - GET returns `checkedKeys` plus `checks[]` with `checkedBy`.
- LWW uses client clocks. A device whose clock runs behind can lose to an earlier real-time check; only future timestamps are clamped.
- `CheckedByChip` shows the checker's initials from `checks[].checkedBy`; there is no claim state.
- Live updates arrive over SSE (`GET /api/events`, see the offline section). Polling is the fallback: 5s, 60s while SSE is connected, paused while offline grocery writes are pending.
- The groceries query key is `['groceries', <weekStartDate>]` (`lib/groceryQueryKey.ts`), not the requested date.
- Store model: `stores(id, name)` plus the `ingredient_stores(ingredientId, storeId)` junction; `custom_grocery_items` and `standing_items` also have `storeId`.
- Custom items are keyed `custom::${id}` and standing items `standing::${id}` in check state.

## Offline-first client and native APK (epic dinner-4kj)

Goal: several shoppers in one store, flaky connectivity, see each other's check-offs within ~1s; offline writes survive restarts and merge on reconnect. The PWA behaves the same offline.

- **Native transport**: the APK origin is `https://localhost`; the bundle bakes `VITE_API_ORIGIN` (`lib/apiOrigin.ts` → `apiUrl()`/`mediaUrl()`; empty on web = same-origin). CapacitorHttp/CapacitorCookies stay **off** (plain WebView fetch, needed for SSE streaming). Requests send `X-Client-Platform: native` and `credentials: 'omit'`; login returns `refreshToken` in the body (no cookie) and refresh/logout take it in the body. The token is stored via `@aparajita/capacitor-secure-storage` (`lib/nativeTokenStore.ts`); `allowBackup=false`.
- **CORS**: `CORS_ORIGIN` is a comma-separated list (`apps/api/src/cors.ts`); prod and testing host compose set `https://localhost`. **`methods` must include PUT/PATCH/DELETE**: `@fastify/cors` defaults to GET,HEAD,POST, which silently broke every APK write once (PR #302). Media routes send `Cross-Origin-Resource-Policy: cross-origin`.
- **Cookie**: do not set a `domain` on the refresh cookie. Without one it binds to whatever host the browser used (localhost, LAN IP, prod/testing subdomains). An explicit `domain: 'localhost'` once broke LAN-IP access.
- **Sessions**: refresh tokens slide on every refresh (web 7d, native `JWT_REFRESH_EXPIRY_NATIVE` 30d); no rotation. The refresh cookie `maxAge` is in **seconds** (it was ms, giving a ~19-year cookie before #281).
- **Errors/timeouts** (`lib/api.ts`): network failures throw `NetworkError{kind}` (never a fake 401). AbortController timeouts: GET 15s, write 20s, refresh 10s, upload 120s, health 5s.
- **Connectivity** (`lib/connectivity.ts`): `onlineManager` is driven by `/health` probes with backoff. On Android the WebView's `navigator.onLine` never changes, so native uses `@capacitor/network` as the probe trigger.
- **Offline session** (`stores/auth.ts`, `lib/sessionSnapshot.ts`): an idb `dinner-planner-session` snapshot. A cold start with a network error and a snapshot under 7d old gives `sessionMode: 'offline'` with cached data; reconnect refreshes, then `resumePausedMutations()`. Query cache max age is 7d, measured from last server contact. Warm prefetch runs after online auth (`lib/warmPrefetch.ts`).
- **Offline write queue** (`lib/offlineMutations.ts`, `lib/mutationQueuePersistence.ts`): `setMutationDefaults` for `['offline', …]` keys (grocery check set/clear, custom/standing add/delete, pantry add/delete), `networkMode: 'online'`, FIFO `scope`. Retry forever on NetworkError, 3x on 5xx, and drop 4xx to the failed store. The failed store is in-memory only (dinner-2sp tracks persisting it). The queue is persisted to idb `dinner-planner-mutation-queue` (owner-scoped, not app-version-scoped) and restored paused in `bindCacheOwner`. The UI renders server data plus an `applyPendingOps` overlay (`lib/pendingOps.ts`). Creates use client UUIDs (server creates are idempotent; deletes always 204). Logout with pending changes asks for confirmation.
- **SSE** (`GET /api/events`, `services/eventBus.ts`, `routes/events.ts`): per-family in-memory bus, 500-event ring buffer, ids `<instanceId>:<seq>`, `Last-Event-ID` replay or `event: reset`, 25s heartbeat, stream ends at token `exp`, `X-Accel-Buffering: no`, closed in `preClose` (not `onClose`, which hangs). Single-process only; scaling out would need a broker. The client is a fetch-streaming reader with Bearer auth (`lib/liveEvents.ts`, `hooks/useLiveEvents.ts`), active only while Grocery/Pantry is visible. Verified unbuffered through Nginx Proxy Manager.
- **APK build and CI**: see [Android app build](../deployment.md#android-app-build).

## Video recipe import

- Transcripts: yt-dlp `--write-subs`/`--write-auto-subs`, English only, manual subs preferred over auto-generated. `parseVtt()` and `downloadVideo()` live in `apps/api/src/services/videoDownload.ts`. The transcript is capped at 8000 chars and appended to the title+description text sent to Ollama in `recipeExtraction.ts`, and stored on `video_jobs.transcript`.
- Resilience (epic dinner-5vx):
  - yt-dlp stderr is captured and mapped to friendly errors.
  - TikTok `tiktok.com/<code>` links are normalized to `/t/<code>/`.
  - If the download fails, a metadata-only pass still extracts the recipe (the job completes with `warning`).
  - Ollama 5xx is retried twice with the body logged.
  - Jobs record `extractionStatus`/`extractionError` and expose `rawTitle`/`rawDescription`.
  - `POST /api/jobs/:id/extract` re-runs extraction async (202 + poll, `status: 'extracting'`).
  - The import modal shows a review step (prefill from the cleaned title/description, "Try extraction again") when no recipe was extracted.
- Link-following (dinner-22c.4, `apps/api/src/services/linkedRecipe.ts`): before the LLM runs, `runExtraction` looks for http(s) links in the description, transcript and (when enabled) comments. Redirect wrappers (`l.facebook.com/l.php?u=`, `lm.facebook.com`, `l.instagram.com/?u=`, `youtube.com/redirect?q=`, `google.com/url?q=`) are unwrapped without a network call, tracking params are stripped, social/video/CDN hosts and the post's own URL are dropped, and at most 3 candidates are kept. Each is fetched through the SSRF-safe `importRecipeFromUrl` (schema.org JSON-LD, no browser or LLM). A usable JSON-LD recipe wins and skips the LLM (`extractionStatus` stays `'llm'`; `sourceUrl` is the linked page, `videoUrl` the post). A page with no JSON-LD contributes its readable text (cap ~6000 chars, first page only) to the model input as a "Linked page (host):" section. The step has a 20 s overall deadline and never fails the import.
  - Stored in `video_jobs.resultMetadata` next to `infoJson`: `extractionSource` (`'caption' | 'linked_page' | 'linked_text'`) and `linkOutcomes` (`[{ url: 'host/path' (no query), result: 'recipe' | 'text' | 'blocked' | 'no_recipe' | 'error' }]`). `blocked` means HTTP 401/403/429 or a Cloudflare-style challenge page; a later headless-browser stage (dinner-22c.5) and the UI can key off it. Re-extract goes through the same path and merges these keys into the existing `resultMetadata`.
- The runner image installs `deno` (Alpine package) so yt-dlp can solve YouTube JS challenges (dinner-5je). Without it yt-dlp logs `JS runtimes: none` and warns that formats may be missing. yt-dlp itself is fetched from `releases/latest` at build time (unpinned).

## Kiosk dashboard (epic dinner-2xi)

- Route `/kiosk?key=dpk_…`: an always-on, today-focused display (landscape: hero + week sidebar; portrait: hero + strip).
- Rolls over at local midnight (DST-safe, re-checks every minute and on wake), holds a wake lock, and auto-reloads after a deploy (version change on `/health`).
- Auth is a **read-only display key** (`display_links` table, `dpk_` prefix, sha256-stored, revocable), managed in Admin → Settings → Display links.
- `GET /api/kiosk/week` accepts only `dpk_` keys (normal routes reject them) and never creates menus. `?key=` is redacted from request logs.

## Production gotchas

- Drizzle `migrationsFolder: './drizzle'` is relative to `process.cwd()`, so the container CMD must `cd /app/apps/api` before running `migrate.js`.
- Helmet CSP: `default-src 'none'` would block all `fetch()`; use the `'self'`-based directives in `apps/api/src/csp.ts`. CSP is disabled outside production (Swagger UI needs inline scripts).
- Never import `server.ts` in tests: it calls `start()`, which fails with EADDRINUSE. Put shared constants in separate files.
- `pnpm deploy` does a fresh install, not a copy. The native modules (`bcrypt`, `better-sqlite3`) build during that install because `allowBuilds` in `pnpm-workspace.yaml` enables them. Do not add a separate `npm rebuild` step in the Dockerfile; it fails with EEXIST (see the Dockerfile comment).
