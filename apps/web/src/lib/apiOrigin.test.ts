import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIsNative } = vi.hoisted(() => ({ mockIsNative: vi.fn(() => false) }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockIsNative() },
}));

import { apiUrl, mediaUrl, getApiOrigin, isMissingNativeOrigin } from './apiOrigin';

beforeEach(() => {
  mockIsNative.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('apiOrigin on web', () => {
  it('ignores VITE_API_ORIGIN and stays same-origin', () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://dinner.example.com');
    expect(getApiOrigin()).toBe('');
    expect(apiUrl('/api/dishes')).toBe('/api/dishes');
    expect(mediaUrl('/uploads/a.jpg')).toBe('/uploads/a.jpg');
    expect(isMissingNativeOrigin()).toBe(false);
  });

  it('passes absolute media URLs through', () => {
    expect(mediaUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});

describe('apiOrigin on native', () => {
  beforeEach(() => {
    mockIsNative.mockReturnValue(true);
  });

  it('prefixes api and media paths with the configured origin', () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://dinner.example.com/');
    expect(getApiOrigin()).toBe('https://dinner.example.com');
    expect(apiUrl('/health')).toBe('https://dinner.example.com/health');
    expect(mediaUrl('/videos/v.mp4')).toBe('https://dinner.example.com/videos/v.mp4');
    expect(mediaUrl('uploads/a.jpg')).toBe('https://dinner.example.com/uploads/a.jpg');
    expect(isMissingNativeOrigin()).toBe(false);
  });

  it('still passes absolute media URLs through unchanged', () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://dinner.example.com');
    expect(mediaUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });

  it('reports a missing origin when VITE_API_ORIGIN is empty', () => {
    vi.stubEnv('VITE_API_ORIGIN', '');
    expect(isMissingNativeOrigin()).toBe(true);
  });
});
