/**
 * Unit tests for videoCleanupScheduler.
 * Uses fake timers to control time-based behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Mock dependencies before importing the module under test
// ============================================================

vi.mock('../services/videoCleanup.js', () => ({
  cleanupOrphanedVideos: vi.fn(),
}));

vi.mock('../services/appEvents.js', () => ({
  logEvent: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    VIDEO_CLEANUP_INTERVAL_HOURS: 24,
    VIDEO_CLEANUP_TIME: '03:00',
  },
}));

import {
  startVideoCleanupScheduler,
  stopVideoCleanupScheduler,
} from '../services/videoCleanupScheduler.js';
import * as videoCleanupService from '../services/videoCleanup.js';
import * as appEventsService from '../services/appEvents.js';
import * as configModule from '../config.js';

const mockCleanupOrphanedVideos = vi.mocked(videoCleanupService.cleanupOrphanedVideos);
const mockLogEvent = vi.mocked(appEventsService.logEvent);
const mockConfig = vi.mocked(configModule).config as {
  VIDEO_CLEANUP_INTERVAL_HOURS: number;
  VIDEO_CLEANUP_TIME: string;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Reset to defaults
  mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 24;
  mockConfig.VIDEO_CLEANUP_TIME = '03:00';
});

afterEach(() => {
  stopVideoCleanupScheduler();
  vi.useRealTimers();
});

// ===========================================================================
// startVideoCleanupScheduler — disabled
// ===========================================================================

describe('startVideoCleanupScheduler — disabled (interval=0)', () => {
  it('does nothing when interval is 0', () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 0;

    startVideoCleanupScheduler();

    expect(mockLogEvent).not.toHaveBeenCalled();
    expect(mockCleanupOrphanedVideos).not.toHaveBeenCalled();
  });

  it('does not schedule a timer when interval is 0', () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 0;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    startVideoCleanupScheduler();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// startVideoCleanupScheduler — custom interval (non-24)
// ===========================================================================

describe('startVideoCleanupScheduler — custom interval', () => {
  it('schedules a repeating interval when interval != 24', () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    startVideoCleanupScheduler();

    expect(setIntervalSpy).toHaveBeenCalledOnce();
    const callArgs = setIntervalSpy.mock.calls[0];
    expect(callArgs[1]).toBe(6 * 60 * 60 * 1000); // 6 hours in ms
  });

  it('logs a start event when interval != 24', () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockLogEvent.mockResolvedValue(undefined);

    startVideoCleanupScheduler();

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        category: 'system',
        message: expect.stringContaining('every 6h'),
      })
    );
  });

  it('runs cleanup when the interval fires', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockCleanupOrphanedVideos.mockResolvedValue({ deletedFiles: [], freedBytes: 0, errors: [] });
    mockLogEvent.mockResolvedValue(undefined);

    startVideoCleanupScheduler();

    // Advance time by one interval
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    expect(mockCleanupOrphanedVideos).toHaveBeenCalledOnce();
  });

  it('runs cleanup multiple times when interval fires multiple times', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockCleanupOrphanedVideos.mockResolvedValue({ deletedFiles: [], freedBytes: 0, errors: [] });
    mockLogEvent.mockResolvedValue(undefined);

    startVideoCleanupScheduler();

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 * 3);

    expect(mockCleanupOrphanedVideos).toHaveBeenCalledTimes(3);
  });
});

// ===========================================================================
// startVideoCleanupScheduler — daily at specific time
// ===========================================================================

describe('startVideoCleanupScheduler — daily schedule (interval=24)', () => {
  it('schedules a setTimeout (not setInterval) for the initial delay', () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 24;
    mockConfig.VIDEO_CLEANUP_TIME = '03:00';
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    startVideoCleanupScheduler();

    expect(setTimeoutSpy).toHaveBeenCalledOnce();
  });

  it('logs a start event with daily schedule description', () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 24;
    mockConfig.VIDEO_CLEANUP_TIME = '03:00';
    mockLogEvent.mockResolvedValue(undefined);

    startVideoCleanupScheduler();

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        category: 'system',
        message: expect.stringContaining('daily at 03:00'),
      })
    );
  });

  it('runs cleanup when the initial timeout fires and then sets up repeating interval', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 24;
    // Use a time that is 1 second before 03:00 in local time
    // Build the target time as local 03:00 and subtract 1 second
    const target = new Date();
    target.setHours(3, 0, 0, 0);
    const oneSecondBefore = new Date(target.getTime() - 1000);
    vi.setSystemTime(oneSecondBefore);
    mockConfig.VIDEO_CLEANUP_TIME = '03:00';
    mockCleanupOrphanedVideos.mockResolvedValue({ deletedFiles: [], freedBytes: 0, errors: [] });
    mockLogEvent.mockResolvedValue(undefined);

    startVideoCleanupScheduler();

    // Advance 2 seconds to trigger the timeout (1s delay + buffer)
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockCleanupOrphanedVideos).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// stopVideoCleanupScheduler
// ===========================================================================

describe('stopVideoCleanupScheduler', () => {
  it('clears the timer so cleanup does not run after stop', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockCleanupOrphanedVideos.mockResolvedValue({ deletedFiles: [], freedBytes: 0, errors: [] });
    mockLogEvent.mockResolvedValue(undefined);

    startVideoCleanupScheduler();
    stopVideoCleanupScheduler();

    // Advance past the interval — cleanup should NOT have run
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    expect(mockCleanupOrphanedVideos).not.toHaveBeenCalled();
  });

  it('is safe to call when no scheduler is running', () => {
    // Should not throw
    expect(() => stopVideoCleanupScheduler()).not.toThrow();
  });
});

// ===========================================================================
// Cleanup result logging
// ===========================================================================

describe('runCleanup result logging', () => {
  it('logs deleted file count when files were cleaned up', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockCleanupOrphanedVideos.mockResolvedValue({
      deletedFiles: ['a.mp4', 'b.mp4'],
      freedBytes: 1024 * 1024 * 5,
      errors: [],
    });
    mockLogEvent.mockResolvedValue(undefined);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    startVideoCleanupScheduler();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    // Should have logged the deletion summary
    const deletionLog = consoleSpy.mock.calls.find(
      (args) => typeof args[0] === 'string' && args[0].includes('deleted 2 files')
    );
    expect(deletionLog).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('logs "no orphaned files" when nothing was cleaned up', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockCleanupOrphanedVideos.mockResolvedValue({
      deletedFiles: [],
      freedBytes: 0,
      errors: [],
    });
    mockLogEvent.mockResolvedValue(undefined);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    startVideoCleanupScheduler();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    const noFilesLog = consoleSpy.mock.calls.find(
      (args) => typeof args[0] === 'string' && args[0].includes('no orphaned files')
    );
    expect(noFilesLog).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('logs errors when cleanup encounters errors', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockCleanupOrphanedVideos.mockResolvedValue({
      deletedFiles: [],
      freedBytes: 0,
      errors: ['ENOENT: /videos/stale.mp4'],
    });
    mockLogEvent.mockResolvedValue(undefined);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startVideoCleanupScheduler();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 errors'), expect.any(Array));

    warnSpy.mockRestore();
  });

  it('logs error to console when cleanupOrphanedVideos throws', async () => {
    mockConfig.VIDEO_CLEANUP_INTERVAL_HOURS = 6;
    mockCleanupOrphanedVideos.mockRejectedValue(new Error('Disk full'));
    mockLogEvent.mockResolvedValue(undefined);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    startVideoCleanupScheduler();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('scheduler error'),
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });
});
