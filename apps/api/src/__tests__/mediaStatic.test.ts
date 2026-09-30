import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';

vi.mock('../db/index.js', () => ({ db: {} }));

const tmpDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'dp-media-'));
  tmpDirs.push(root);
  vi.stubEnv('DATABASE_URL', `file:${join(root, 'vol', 'dinner.db')}`);
  delete process.env.VIDEOS_DIR;
  delete process.env.UPLOADS_DIR;
  vi.resetModules();
  const paths = await import('../dataPaths.js');
  const { registerMediaStatic, MEDIA_CACHE_CONTROL } = await import('../mediaStatic.js');
  const app = Fastify();
  await registerMediaStatic(app);
  return { paths, app, MEDIA_CACHE_CONTROL };
}

describe('registerMediaStatic', () => {
  it('creates the media directories on a fresh volume', async () => {
    const { paths, app } = await setup();
    const { existsSync } = await import('node:fs');
    expect(existsSync(paths.UPLOADS_DIR)).toBe(true);
    expect(existsSync(paths.VIDEOS_DIR)).toBe(true);
    await app.close();
  });

  it('serves /uploads/ from the same UPLOADS_DIR the photo service writes to', async () => {
    const { paths, app, MEDIA_CACHE_CONTROL } = await setup();
    const photos = await import('../services/photos.js');
    expect(photos.UPLOADS_DIR).toBe(paths.UPLOADS_DIR);

    writeFileSync(join(photos.UPLOADS_DIR, 'abc.png'), 'img');
    const res = await app.inject({ method: 'GET', url: '/uploads/abc.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(MEDIA_CACHE_CONTROL);
    await app.close();
  });

  it('serves /videos/ from the same VIDEOS_DIR the video service uses', async () => {
    const { paths, app } = await setup();
    const videos = await import('../services/videoDownload.js');
    expect(videos.VIDEOS_DIR).toBe(paths.VIDEOS_DIR);

    writeFileSync(join(videos.VIDEOS_DIR, 'thumb.jpg'), 'img');
    const res = await app.inject({ method: 'GET', url: '/videos/thumb.jpg' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
