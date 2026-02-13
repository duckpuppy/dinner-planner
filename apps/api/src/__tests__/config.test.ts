import { afterEach, describe, expect, it, vi } from 'vitest';

const loadConfig = async () => {
  vi.resetModules();
  return import('../config.js');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('config', () => {
  it('loads defaults with required secret', async () => {
    vi.stubEnv('JWT_SECRET', 'x'.repeat(32));
    vi.stubEnv('NODE_ENV', '');
    const { config } = await loadConfig();

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.JWT_SECRET).toHaveLength(32);
  });

  it('respects explicit env values', async () => {
    vi.stubEnv('JWT_SECRET', 'y'.repeat(32));
    vi.stubEnv('PORT', '4000');
    vi.stubEnv('NODE_ENV', 'test');

    const { config } = await loadConfig();

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
  });
});
