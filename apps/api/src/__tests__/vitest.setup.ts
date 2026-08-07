// Runs once per Vitest worker, before any test file's imports are resolved.
// Gives each worker its own SQLite file so parallel workers never contend for
// the same physical database file (see dinner-dir: intermittent
// "database is locked" / SQLITE_BUSY failures caused by every test file that
// transitively imports src/db/index.ts opening a connection to the same
// shared file).
// VITEST_POOL_ID is stable per actual worker process across the run.
// VITEST_WORKER_ID was empirically observed (locally, vitest@4.1.10) to vary
// *within* a single VITEST_POOL_ID across different test files in the same
// worker, so it is not a safe key for a per-process file path — kept only as
// a fallback in case VITEST_POOL_ID is ever unset.
const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';

process.env.DATABASE_URL = `file:./data/test-${workerId}.db`;
