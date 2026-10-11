import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// A fixed port (override with E2E_PORT) because Playwright workers re-evaluate this file and
// must agree on the URL. 3100 stays clear of dev (3000/5173) and the testing container (3002).
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TMP_DIR = fileURLToPath(new URL('./.tmp', import.meta.url));
const DB_FILE = `${TMP_DIR}/e2e.db`;
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  outputDir: './test-results',
  // Tests share one server and one family; each uses its own week so they cannot see each
  // other's data, but timing-sensitive sync assertions are steadier without CPU contention.
  workers: 1,
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // The SPA is a PWA; offline cold starts rely on its service worker.
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build the SPA, migrate a fresh DB, then serve SPA + API from one origin (like prod).
    command: [
      'pnpm --filter @dinner-planner/shared build',
      'pnpm --filter @dinner-planner/web build',
      `rm -rf ${TMP_DIR}`,
      `mkdir -p ${TMP_DIR}`,
      'pnpm --filter @dinner-planner/api db:migrate',
      'pnpm --filter @dinner-planner/api exec tsx src/server.ts',
    ].join(' && '),
    cwd: REPO_ROOT,
    url: `${BASE_URL}/health`,
    // Always a fresh DB: reusing a server would carry state from a previous run.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production', // makes the API serve apps/web/dist
      HOST: '127.0.0.1',
      PORT: String(PORT),
      DATABASE_URL: `file:${DB_FILE}`,
      JWT_SECRET: 'e2e-only-jwt-secret-at-least-32-characters-long',
      CORS_ORIGIN: BASE_URL,
      ADMIN_USERNAME: 'alice',
      ADMIN_PASSWORD: 'e2e-password-123',
      VIDEO_CLEANUP_INTERVAL_HOURS: '0',
      LLM_MODE: 'disabled',
    },
  },
});
