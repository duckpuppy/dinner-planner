# Release pipeline: main → testing → release

Three-branch model. Each promotion is a fast-forward-only merge triggered via a workflow, never a local `git` command, so promotion can be done from GitHub's mobile UI.

```bash
gh workflow run promote.yml -f target=testing   # main → testing
gh workflow run promote.yml -f target=release   # testing → release
```

Promotion is deliberately **not** triggered on every `main` push. Multi-phase epics leave `main` not yet feature-complete between phases, so testing and release cuts are always manual, deliberate actions.

## Testing

- `promote.yml -f target=testing` fast-forwards `main` → `testing`, which triggers `testing.yml`. It builds and pushes `ghcr.io/duckpuppy/dinner-planner:testing` and `:testing-<short-sha>`, with no version bump and no GitHub Release. That triggers `deploy-testing.yml` on the self-hosted runner.
- The push to `testing` also runs `android-testing.yml`, which publishes a signed staging APK to the rolling `testing-apk` pre-release (see [Android app build](../deployment.md#android-app-build)). APK failures never block the Docker deploys.
- Testing host: the **same** self-hosted runner as production (`[self-hosted, dinner-planner]`), as a second container `dinner-planner-testing` on port **3002** (prod stays on 3000), with a separate data volume and separate `TESTING_JWT_SECRET`/`TESTING_ADMIN_PASSWORD`. Nginx Proxy Manager fronts it at `dinner-test.duckpuppy.net` → `192.168.0.95:3002`.

## Release

- `promote.yml -f target=release` fast-forwards `testing` → `release`, which triggers `release.yml` (push-triggered off `release`, plus `workflow_dispatch`).
- `release.yml` steps:
  - Commit the version bump on `release` (not `main`), which avoids the race where `main` drifts ahead between cutting testing and promoting.
  - Tag, create the GitHub Release, then build and push the image and deploy.
  - Merge `release` back into `main` with `--no-ff` so `main`'s `package.json` doesn't go stale. It fails loudly on conflict rather than auto-resolving.
- A guard job skips the workflow's own `chore: release` commit and is idempotent if the tag already exists (dinner-cip).
- The `v*` tag runs `android-release.yml`, which attaches the signed prod APK to the Release. APK failures never block the Docker deploys.
- The GHCR package is **public** (verified via an anonymous pull token; public packages have unlimited storage and bandwidth), so `release.yml`'s version cleanup keeps the last 15. Image availability does not guarantee rollback safety if a DB migration in between isn't backward-compatible; this pipeline doesn't solve that.
- `ci.yml` intentionally does NOT trigger on `testing`/`release` pushes.

## APP_VERSION

One string baked in at build time via the Dockerfile `APP_VERSION` build-arg. In the builder stage vite reads it as `__APP_VERSION__` (shown in the `Layout` sidebar); in the runner stage it is `ENV APP_VERSION` for the API.

| Build                        | Value                                      |
| ---------------------------- | ------------------------------------------ |
| `testing.yml`                | `testing-<7-char sha>` (matches image tag) |
| `release.yml`                | plain semver, without the `v`              |
| `android-apk.yml`            | `android-<7-char sha>`                     |
| plain `docker build` / local | `<root package.json version>-dev`          |

The UI renders `vX.Y.Z` only for plain semver; anything else is shown raw in amber. `.git` is dockerignored, so the sha must come in as a build-arg.

## Pre-promotion check: scripts/verify-upgrade.sh

Run before `promote.yml -f target=release`. It dry-runs pending migrations against a copy of the production DB.

- `scripts/verify-upgrade.sh --from-host mediaserver` takes an online `better-sqlite3` backup inside the `dinner-planner` container (`--container NAME` to override; the image has no `sqlite3` binary), copies it out, removes the remote temp copies, then runs `apps/api/src/db/migrate.ts` on the copy.
- It checks:
  - Row counts are unchanged for every pre-existing table, except the documented dedupe decreases in `dinner_entries`/`weekly_menus`/`entry_side_dishes`/`prep_tasks`, which are reported with their counts. There must also be no duplicate `(family_id, date)` entries.
  - Every `family_id` column has 0 NULL and 0 dangling values and is NOT NULL.
  - `foreign_key_check` and `integrity_check` are clean.
  - All migrations are recorded, and no `__new_*` tables are left over.
- `--db FILE` checks a local DB file (copies `-wal`/`-shm` and checkpoints the copy). `--keep` retains the work dir on PASS; it is always kept on FAIL.
- It refuses to run unless `HEAD == origin/testing` (override with `--force`) and there are no uncommitted changes under `apps/api/drizzle` or `apps/api/src/db`.
- It never modifies the source DB and exits non-zero on any failure.

## Post-release super-admin grant

Migration `0031` adds `users.is_super_admin` and leaves every existing user at 0, so nobody can use instance-wide user/family management after upgrading until one is granted manually. After the release deploys, run against the production DB:

```sql
UPDATE users SET is_super_admin = 1 WHERE username = '<you>';
```

The verify script prints this hint along with the current users and roles.

## Branch protection

- Repo ruleset "promotion branches" (id 25329832) on `testing`/`release` blocks deletion and force-push, with no bypass actors.
- It must **not** require linear history. `main` is built from merge-commit PRs and promote fast-forwards those merge commits into `testing`/`release` (and `release.yml` syncs back with `--no-ff`), so that rule rejects every promotion with `GH013 … must not contain merge commits`. This happened once, on 2026-10-18, and the rule was removed.
- It deliberately does **not** restrict who can push: `RELEASE_PAT` is the owner's own token, so a push restriction couldn't tell workflow pushes from manual ones. All promote/release pushes are fast-forwards, so the ruleset never blocks them.
- A rollback that needs a force-push means temporarily disabling the ruleset.

## Host configuration (~/src/services on mediaserver)

Host-side files live outside this repo, in `~/src/services` on the `mediaserver` (`192.168.0.95`) host.

- `dinner-planner/compose.yml` has the `dinner-planner` and `dinner-planner-testing` services. Both set `CORS_ORIGIN: https://localhost` for the native APK.
- `justfile` has `dinner-planner-testing-deploy`, `-down` and `-logs`. They are deliberately not wired into the aggregate `up`/`down`/`pull-all` recipes.
