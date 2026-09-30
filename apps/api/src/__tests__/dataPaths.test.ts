import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async () => {
  vi.resetModules();
  return import('../dataPaths.js');
};

const tmpDirs: string[] = [];
const makeTmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'dp-data-'));
  tmpDirs.push(d);
  return d;
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('resolveDataDir', () => {
  it('uses the directory of an absolute DATABASE_URL', async () => {
    const { resolveDataDir } = await load();
    expect(resolveDataDir('file:/app/data/dinner.db')).toBe('/app/data');
  });

  it('resolves a relative DATABASE_URL against the cwd', async () => {
    const { resolveDataDir } = await load();
    expect(resolveDataDir('file:./data/dinner.db', '/srv/api')).toBe('/srv/api/data');
    expect(resolveDataDir('file:data/dinner.db', '/srv/api')).toBe('/srv/api/data');
  });
});

describe('media dirs', () => {
  it('defaults to subdirectories of the database directory', async () => {
    vi.stubEnv('DATABASE_URL', 'file:/app/data/dinner.db');
    delete process.env.VIDEOS_DIR;
    delete process.env.UPLOADS_DIR;
    const m = await load();
    expect(m.DATA_DIR).toBe('/app/data');
    expect(m.VIDEOS_DIR).toBe('/app/data/videos');
    expect(m.UPLOADS_DIR).toBe('/app/data/uploads');
  });

  it('honours VIDEOS_DIR and UPLOADS_DIR overrides', async () => {
    vi.stubEnv('DATABASE_URL', 'file:/app/data/dinner.db');
    vi.stubEnv('VIDEOS_DIR', '/mnt/v');
    vi.stubEnv('UPLOADS_DIR', '/mnt/u');
    const m = await load();
    expect(m.VIDEOS_DIR).toBe('/mnt/v');
    expect(m.UPLOADS_DIR).toBe('/mnt/u');
  });

  it('ensureDataDirs creates missing directories recursively and is idempotent', async () => {
    const root = makeTmp();
    vi.stubEnv('DATABASE_URL', `file:${root}/vol/dinner.db`);
    delete process.env.VIDEOS_DIR;
    delete process.env.UPLOADS_DIR;
    const m = await load();
    expect(existsSync(m.VIDEOS_DIR)).toBe(false);
    m.ensureDataDirs();
    m.ensureDataDirs();
    expect(existsSync(join(root, 'vol', 'videos'))).toBe(true);
    expect(existsSync(join(root, 'vol', 'uploads'))).toBe(true);
  });
});
