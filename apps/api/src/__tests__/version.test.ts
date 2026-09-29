import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { resolveAppVersion } from '../version.js';

vi.mock('../services/setup.js', () => ({ isSetupRequired: vi.fn().mockResolvedValue(false) }));

const rootVersion = (
  JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveAppVersion', () => {
  it('uses APP_VERSION when set', () => {
    expect(resolveAppVersion({ APP_VERSION: 'testing-abc1234' })).toBe('testing-abc1234');
  });

  it.each([{}, { APP_VERSION: '' }, { APP_VERSION: '   ' }])(
    'falls back to <pkg>-dev for %j',
    (env) => {
      expect(resolveAppVersion(env)).toBe(`${rootVersion}-dev`);
    }
  );

  it('returns unknown-dev when package.json is unreadable', () => {
    expect(resolveAppVersion({}, 'file:///nonexistent/a/b/c/version.js')).toBe('unknown-dev');
  });
});

describe('health endpoints report APP_VERSION', () => {
  const build = async () => {
    vi.resetModules();
    const { healthRoutes } = await import('../routes/health.js');
    const app = Fastify();
    await app.register(healthRoutes);
    await app.ready();
    return app;
  };

  it('reports env value on both endpoints', async () => {
    vi.stubEnv('APP_VERSION', 'testing-abc1234');
    const app = await build();
    for (const url of ['/health', '/api/v1/health']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.json().version).toBe('testing-abc1234');
    }
    await app.close();
  });

  it('reports <pkg>-dev when env is empty', async () => {
    vi.stubEnv('APP_VERSION', '');
    const app = await build();
    for (const url of ['/health', '/api/v1/health']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.json().version).toBe(`${rootVersion}-dev`);
    }
    await app.close();
  });
});
