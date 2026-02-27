import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isMobileDevice, prefersReducedMotion, getSafeAreaInsets, TOUCH_TARGET_MIN } from './mobile';

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

  describe('getSafeAreaInsets', () => {
    it('returns CSS custom property values for safe area insets', () => {
      const mockStyle = {
        getPropertyValue: vi.fn((prop: string) => {
          const values: Record<string, string> = {
            '--sat': '20px',
            '--sab': '34px',
            '--sal': '0px',
            '--sar': '0px',
          };
          return values[prop] ?? '';
        }),
      };
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        mockStyle as unknown as CSSStyleDeclaration
      );

      const insets = getSafeAreaInsets();

      expect(insets.top).toBe('20px');
      expect(insets.bottom).toBe('34px');
      expect(insets.left).toBe('0px');
      expect(insets.right).toBe('0px');
    });

    it('returns 0px fallbacks when CSS properties return empty string', () => {
      const mockStyle = {
        getPropertyValue: vi.fn(() => ''),
      };
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        mockStyle as unknown as CSSStyleDeclaration
      );

      const insets = getSafeAreaInsets();

      expect(insets.top).toBe('0px');
      expect(insets.bottom).toBe('0px');
      expect(insets.left).toBe('0px');
      expect(insets.right).toBe('0px');
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
