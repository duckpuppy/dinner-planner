/**
 * Service unit tests for getSystemHealth (mocked db and dependencies).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Hoisted mocks — must be declared before imports
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

const mockGetVideoStorageUsage = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  sql: Object.assign(vi.fn().mockReturnValue(null), { join: vi.fn().mockReturnValue(null) }),
  desc: vi.fn().mockReturnValue(null),
  gte: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    appEvents: {
      id: null,
      level: null,
      category: null,
      message: null,
      details: null,
      userId: null,
      createdAt: null,
    },
    videoJobs: {
      id: null,
      status: null,
    },
  },
}));

vi.mock('../services/videoDownload.js', () => ({
  getVideoStorageUsage: mockGetVideoStorageUsage,
}));

vi.mock('../config.js', () => ({
  config: {
    VIDEO_STORAGE_LIMIT_MB: 10240,
    VIDEO_CLEANUP_INTERVAL_HOURS: 24,
    VIDEO_CLEANUP_TIME: '03:00',
  },
}));

import { getSystemHealth } from '../services/systemHealth.js';

// ============================================================
// Chain helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSelectChain(result: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.then = (onFulfilled?: (v: unknown[]) => void) => {
    if (onFulfilled) onFulfilled(result);
    return chain;
  };
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  return chain;
}

/**
 * Default mock setup: no jobs, no cleanup events, no error/warning events.
 */
function setupDefaultMocks() {
  mockGetVideoStorageUsage.mockResolvedValue(0);

  // videoJobs group-by query
  mockDb.select.mockReturnValueOnce(makeSelectChain([]));
  // cleanup event query
  mockDb.select.mockReturnValueOnce(makeSelectChain([]));
  // errorsLast24h
  mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
  // warningsLast24h
  mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
  // errorsLast7d
  mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Video storage
// ============================================================

describe('getSystemHealth — videoStorage', () => {
  it('returns correct usedBytes, usedMb, limitMb, and percentUsed', async () => {
    // 1 GB = 1073741824 bytes → ~1024 MB → ~10% of 10240 MB
    const onGb = 1024 * 1024 * 1024;
    mockGetVideoStorageUsage.mockResolvedValue(onGb);

    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // jobs
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // cleanup
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }])); // err24h
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }])); // warn24h
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }])); // err7d

    const health = await getSystemHealth();

    expect(health.videoStorage.usedBytes).toBe(onGb);
    expect(health.videoStorage.usedMb).toBeCloseTo(1024, 0);
    expect(health.videoStorage.limitMb).toBe(10240);
    expect(health.videoStorage.percentUsed).toBeCloseTo(10, 0);
  });

  it('returns 0 percentUsed when storage is empty', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));

    const health = await getSystemHealth();

    expect(health.videoStorage.usedBytes).toBe(0);
    expect(health.videoStorage.percentUsed).toBe(0);
  });
});

// ============================================================
// Video job counts
// ============================================================

describe('getSystemHealth — videoJobs', () => {
  it('returns correct job counts by status', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    mockDb.select.mockReturnValueOnce(
      makeSelectChain([
        { status: 'pending', count: 3 },
        { status: 'downloading', count: 1 },
        { status: 'complete', count: 20 },
        { status: 'failed', count: 2 },
      ])
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // cleanup
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));

    const health = await getSystemHealth();

    expect(health.videoJobs.pending).toBe(3);
    expect(health.videoJobs.downloading).toBe(1);
    expect(health.videoJobs.complete).toBe(20);
    expect(health.videoJobs.failed).toBe(2);
    expect(health.videoJobs.total).toBe(26);
  });

  it('defaults missing statuses to 0', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ status: 'complete', count: 5 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));

    const health = await getSystemHealth();

    expect(health.videoJobs.pending).toBe(0);
    expect(health.videoJobs.downloading).toBe(0);
    expect(health.videoJobs.failed).toBe(0);
    expect(health.videoJobs.complete).toBe(5);
    expect(health.videoJobs.total).toBe(5);
  });
});

// ============================================================
// Cleanup
// ============================================================

describe('getSystemHealth — cleanup', () => {
  it('returns null lastRun and null lastResult when no cleanup events exist', async () => {
    setupDefaultMocks();

    const health = await getSystemHealth();

    expect(health.cleanup.lastRun).toBeNull();
    expect(health.cleanup.lastResult).toBeNull();
  });

  it('returns lastRun ISO date from most recent cleanup event', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // jobs
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([
        {
          createdAt: '2026-04-17T03:00:00.000Z',
          details: JSON.stringify({ deletedFiles: 5, freedBytes: 1048576, errors: 0 }),
        },
      ])
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));

    const health = await getSystemHealth();

    expect(health.cleanup.lastRun).toBe('2026-04-17T03:00:00.000Z');
    expect(health.cleanup.lastResult).toEqual({
      deletedFiles: 5,
      freedBytes: 1048576,
      errors: 0,
    });
  });

  it('returns lastRun but null lastResult when cleanup event has no details', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ createdAt: '2026-04-16T03:00:00.000Z', details: null }])
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));

    const health = await getSystemHealth();

    expect(health.cleanup.lastRun).toBe('2026-04-16T03:00:00.000Z');
    expect(health.cleanup.lastResult).toBeNull();
  });

  it('returns schedulerEnabled=true and "daily at 03:00" for default config', async () => {
    setupDefaultMocks();

    const health = await getSystemHealth();

    expect(health.cleanup.schedulerEnabled).toBe(true);
    expect(health.cleanup.schedulerConfig).toBe('daily at 03:00');
  });
});

// ============================================================
// Scheduler config strings
// ============================================================

describe('getSystemHealth — schedulerConfig', () => {
  it('returns "disabled" when interval is 0', async () => {
    // Override config mock for this test
    const { config: cfg } = await import('../config.js');
    (cfg as Record<string, unknown>).VIDEO_CLEANUP_INTERVAL_HOURS = 0;

    setupDefaultMocks();

    const health = await getSystemHealth();

    expect(health.cleanup.schedulerEnabled).toBe(false);
    expect(health.cleanup.schedulerConfig).toBe('disabled');

    // Restore
    (cfg as Record<string, unknown>).VIDEO_CLEANUP_INTERVAL_HOURS = 24;
  });

  it('returns "every Xh" for non-24 intervals', async () => {
    const { config: cfg } = await import('../config.js');
    (cfg as Record<string, unknown>).VIDEO_CLEANUP_INTERVAL_HOURS = 6;

    setupDefaultMocks();

    const health = await getSystemHealth();

    expect(health.cleanup.schedulerEnabled).toBe(true);
    expect(health.cleanup.schedulerConfig).toBe('every 6h');

    // Restore
    (cfg as Record<string, unknown>).VIDEO_CLEANUP_INTERVAL_HOURS = 24;
  });
});

// ============================================================
// Event counts
// ============================================================

describe('getSystemHealth — events', () => {
  it('returns correct error and warning counts for time windows', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // jobs
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // cleanup
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 4 }])); // errorsLast24h
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 7 }])); // warningsLast24h
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 12 }])); // errorsLast7d

    const health = await getSystemHealth();

    expect(health.events.errorsLast24h).toBe(4);
    expect(health.events.warningsLast24h).toBe(7);
    expect(health.events.errorsLast7d).toBe(12);
  });

  it('defaults event counts to 0 when queries return no rows', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // jobs
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // cleanup
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // errorsLast24h — empty
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // warningsLast24h — empty
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // errorsLast7d — empty

    const health = await getSystemHealth();

    expect(health.events.errorsLast24h).toBe(0);
    expect(health.events.warningsLast24h).toBe(0);
    expect(health.events.errorsLast7d).toBe(0);
  });
});
