# End-to-end tests

Playwright (Chromium only) drives the real SPA against the real API and a throwaway SQLite
database. They live in the `e2e/` workspace package (`@dinner-planner/e2e`), separate from the
vitest unit tests, so `pnpm test` / `turbo test` never runs them.

## Run locally

```bash
pnpm install
pnpm --filter @dinner-planner/e2e exec playwright install chromium   # once
pnpm test:e2e
```

`playwright.config.ts` starts the server itself (`webServer`). It builds `@dinner-planner/shared`
and the web app, migrates a fresh DB in `e2e/.tmp/`, then runs the API with `NODE_ENV=production`
so it serves `apps/web/dist` on the same origin, as in production. The default port is `3100`;
override with `E2E_PORT`. Nothing here touches `apps/api/data`.

Useful variants (run from `e2e/` or prefix with `pnpm --filter @dinner-planner/e2e exec`):

```bash
playwright test -g "offline queue"     # one test
playwright test --headed               # watch the browsers
playwright test --trace on             # record a trace for every test
playwright show-report                 # open e2e/playwright-report (CI mode writes it)
playwright show-trace e2e/test-results/<test>/trace.zip
```

## How it works

- `global-setup.ts` uses the admin the API seeds on boot (`alice`), gives her a display name,
  creates a second member (`bob`) in the same family, and logs each in once through the UI to
  save storage states under `e2e/.tmp/auth/`.
- Each test builds its own contexts from those states (`support/shopper.ts`) and seeds data with
  API calls (`support/api.ts`). Every test uses a different week, so tests do not share data.
- Contexts send a unique `X-Forwarded-For` (the API trusts the proxy header) so the per-IP login
  and refresh rate limits do not couple tests together.
- Offline is simulated with `context.setOffline(true)`. The offline cold start relies on the PWA
  service worker, which the tests wait on before cutting the network.
- No fixed sleeps: web-first assertions and `expect.poll` only. CI uses `retries: 1` and records
  a trace on the first retry.

## CI

The `e2e` job in `.github/workflows/ci.yml` installs Chromium, runs `pnpm test:e2e`, and uploads
`e2e/playwright-report/` and `e2e/test-results/` (traces) as the `playwright-report` artifact when
the job fails. To gate merges on it, add `E2E (Playwright)` to the required status checks.
