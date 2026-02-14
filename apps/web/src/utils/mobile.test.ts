import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isMobileDevice, prefersReducedMotion, TOUCH_TARGET_MIN } from './mobile';

describe('mobile utilities', () => {
  beforeEach(() => {
    // Reset navigator.userAgent before each test
    vi.stubGlobal('navigator', {
      userAgent: '',
    });
  });

  describe('TOUCH_TARGET_MIN', () => {
    it('exports minimum touch target size', () => {
      expect(TOUCH_TARGET_MIN).toBe(44);
    });
  });

  describe('isMobileDevice', () => {
    it('returns true for Android devices', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36',
      });
      // @ts-expect-error - window.ontouchstart is set in the test
      window.ontouchstart = {};

      expect(isMobileDevice()).toBe(true);
    });

    it('returns true for iPhone devices', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      });
      // @ts-expect-error - window.ontouchstart is set in the test
      window.ontouchstart = {};

      expect(isMobileDevice()).toBe(true);
    });

    it('returns true for iPad devices', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
      });
      // @ts-expect-error - window.ontouchstart is set in the test
      window.ontouchstart = {};

      expect(isMobileDevice()).toBe(true);
    });

    it('returns false for desktop devices', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
      // @ts-expect-error - delete window property
      delete window.ontouchstart;

      expect(isMobileDevice()).toBe(false);
    });

    it('returns false when ontouchstart is not present', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36',
      });
      // @ts-expect-error - delete window property
      delete window.ontouchstart;

      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('prefersReducedMotion', () => {
    it('returns true when user prefers reduced motion', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      expect(prefersReducedMotion()).toBe(true);
    });

    it('returns false when user does not prefer reduced motion', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      expect(prefersReducedMotion()).toBe(false);
    });

    it('returns false when matchMedia is not supported', () => {
      // @ts-expect-error - delete window property
      delete window.matchMedia;

      expect(prefersReducedMotion()).toBe(false);
    });
  });
});
