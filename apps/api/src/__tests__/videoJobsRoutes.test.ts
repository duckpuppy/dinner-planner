/**
 * Route integration tests for videoJobs routes using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { videoJobsRoutes } from '../routes/videoJobs.js';

// Mock all service/db dependencies
vi.mock('../services/videoJobs.js', () => ({
  createVideoJob: vi.fn(),
  getVideoJobForFamily: vi.fn(),
  processVideoJob: vi.fn(),
  reextractVideoJob: vi.fn(),
}));

vi.mock('../services/settings.js', () => ({
  getSettings: vi.fn(),
}));

vi.mock('../services/videoCleanup.js', () => ({
  cleanupOrphanedVideos: vi.fn(),
}));

vi.mock('../services/ollama.js', () => ({
  checkOllamaHealth: vi.fn(),
}));

vi.mock('../services/videoDownload.js', () => ({
  deleteVideo: vi.fn(),
  VIDEOS_DIR: '/tmp/videos',
}));

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
  schema: {
    dishes: { id: null, createdById: null, localVideoFilename: null },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
}));

// Mock node:fs for streaming (statSync)
vi.mock('node:fs', () => ({
  createReadStream: vi.fn(),
  statSync: vi.fn(),
}));

import * as videoJobsService from '../services/videoJobs.js';
import * as settingsService from '../services/settings.js';
import * as ollamaService from '../services/ollama.js';
import * as videoDownloadService from '../services/videoDownload.js';
import * as dbModule from '../db/index.js';

const mockDb = vi.mocked(dbModule.db);
const mockCreateVideoJob = vi.mocked(videoJobsService.createVideoJob);
const mockGetVideoJob = vi.mocked(videoJobsService.getVideoJobForFamily);
const mockGetSettings = vi.mocked(settingsService.getSettings);
const mockCheckOllamaHealth = vi.mocked(ollamaService.checkOllamaHealth);
const mockDeleteVideo = vi.mocked(videoDownloadService.deleteVideo);

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(videoJobsRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp, role: 'member' | 'admin' = 'member') {
  const token = app.jwt.sign({ userId: 'user-1', username: 'alice', role, familyId: 'fam-1' });
  return { Authorization: `Bearer ${token}` };
}

function adminHeader(app: TestApp) {
  return bearerHeader(app, 'admin');
}

function jsonHeaders(app: TestApp, role: 'member' | 'admin' = 'member') {
  return { ...bearerHeader(app, role), 'content-type': 'application/json' };
}

function makeSelectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

// ===========================================================================
// POST /api/dishes/import-video-url
// ===========================================================================

describe('POST /api/dishes/import-video-url', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 202 with jobId on valid URL', async () => {
    mockGetSettings.mockResolvedValue({ videoStorageLimitMb: 1024 } as ReturnType<
      typeof mockGetSettings
    > extends Promise<infer T>
      ? T
      : never);
    mockCreateVideoJob.mockResolvedValue('job-abc-123');
    vi.mocked(videoJobsService.processVideoJob).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-video-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    });

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toMatchObject({ jobId: 'job-abc-123' });
  });

  it('returns 400 for invalid URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-video-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({ url: 'not-a-url' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Invalid URL' });
  });

  it('returns 400 when url is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-video-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-video-url',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=test' }),
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/jobs/:id
// ===========================================================================

describe('GET /api/jobs/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with job data', async () => {
    const fakeJob = {
      id: 'job-1',
      sourceUrl: 'https://example.com',
      status: 'complete',
      progress: 100,
      resultMetadata: JSON.stringify({ thumbnailFilename: 'thumb.jpg' }),
      extractedRecipe: JSON.stringify({ title: 'Test Recipe' }),
      error: null,
    };
    mockGetVideoJob.mockResolvedValue(
      fakeJob as ReturnType<typeof mockGetVideoJob> extends Promise<infer T> ? T : never
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.job.id).toBe('job-1');
    expect(body.job.status).toBe('complete');
    expect(body.job.resultMetadata).toEqual({ thumbnailFilename: 'thumb.jpg' });
    expect(body.job.extractedRecipe).toEqual({ title: 'Test Recipe' });
  });

  it('returns 200 with null metadata when resultMetadata is invalid JSON', async () => {
    const fakeJob = {
      id: 'job-2',
      sourceUrl: 'https://example.com',
      status: 'complete',
      progress: 100,
      resultMetadata: 'invalid-json{{{',
      extractedRecipe: null,
      error: null,
    };
    mockGetVideoJob.mockResolvedValue(
      fakeJob as ReturnType<typeof mockGetVideoJob> extends Promise<infer T> ? T : never
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-2',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.job.resultMetadata).toBeNull();
  });

  it('returns 200 with null metadata and null recipe when both absent', async () => {
    const fakeJob = {
      id: 'job-3',
      sourceUrl: 'https://example.com',
      status: 'pending',
      progress: 0,
      resultMetadata: null,
      extractedRecipe: null,
      error: null,
    };
    mockGetVideoJob.mockResolvedValue(
      fakeJob as ReturnType<typeof mockGetVideoJob> extends Promise<infer T> ? T : never
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-3',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.job.resultMetadata).toBeNull();
    expect(body.job.extractedRecipe).toBeNull();
  });

  it('returns 404 when job not found', async () => {
    mockGetVideoJob.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Job not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/settings/ollama-status
// ===========================================================================

describe('GET /api/settings/ollama-status', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with available:false when ollamaUrl is not set', async () => {
    mockGetSettings.mockResolvedValue({ ollamaUrl: null } as ReturnType<
      typeof mockGetSettings
    > extends Promise<infer T>
      ? T
      : never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/ollama-status',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ available: false, url: null });
  });

  it('returns 200 with available:true when ollama is healthy', async () => {
    mockGetSettings.mockResolvedValue({ ollamaUrl: 'http://localhost:11434' } as ReturnType<
      typeof mockGetSettings
    > extends Promise<infer T>
      ? T
      : never);
    mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['llama3'] });

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/ollama-status',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ available: true, url: 'http://localhost:11434' });
  });

  it('returns 200 with available:false when ollama is unreachable', async () => {
    mockGetSettings.mockResolvedValue({ ollamaUrl: 'http://localhost:11434' } as ReturnType<
      typeof mockGetSettings
    > extends Promise<infer T>
      ? T
      : never);
    mockCheckOllamaHealth.mockResolvedValue({ available: false, models: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/ollama-status',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ available: false, url: 'http://localhost:11434' });
  });

  it('returns 403 for non-admin user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/ollama-status',
      headers: bearerHeader(app, 'member'),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/ollama-status',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/settings/test-ollama
// ===========================================================================

describe('POST /api/settings/test-ollama', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { available: true, modelFound: null } when no model provided and ollama is healthy', async () => {
    mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['llama3', 'gemma2'] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
      headers: { ...adminHeader(app), 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:11434' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ available: true, modelFound: null });
    expect(mockCheckOllamaHealth).toHaveBeenCalledWith('http://localhost:11434');
  });

  it('returns { available: false, modelFound: null } when ollama is not reachable', async () => {
    mockCheckOllamaHealth.mockResolvedValue({ available: false, models: [] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
      headers: { ...adminHeader(app), 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:11434' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ available: false, modelFound: null });
  });

  it('returns { available: true, modelFound: true } when model is provided and found', async () => {
    mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['llama3', 'gemma2'] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
      headers: { ...adminHeader(app), 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:11434', model: 'llama3' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ available: true, modelFound: true });
  });

  it('returns { available: true, modelFound: false } when model is provided but not found', async () => {
    mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['llama3', 'gemma2'] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
      headers: { ...adminHeader(app), 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:11434', model: 'mistral' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ available: true, modelFound: false });
  });

  it('returns 400 when url is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
      headers: { ...adminHeader(app), 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when url is not a valid URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
      headers: { ...adminHeader(app), 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
      headers: { ...bearerHeader(app, 'member'), 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:11434' }),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-ollama',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/dishes/:id/video
// ===========================================================================

describe('DELETE /api/dishes/:id/video', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 and deletes video when owner calls it', async () => {
    const fakeDish = {
      id: 'dish-1',
      createdById: 'user-1',
      localVideoFilename: 'video.mp4',
    };
    mockDb.select.mockReturnValue(makeSelectChain([fakeDish]));
    mockDeleteVideo.mockResolvedValue(undefined);
    mockDb.update.mockReturnValue(makeUpdateChain());

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dishes/dish-1/video',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
    expect(mockDeleteVideo).toHaveBeenCalledWith('video.mp4');
  });

  it('returns 204 when dish has no video (nothing to delete)', async () => {
    const fakeDish = {
      id: 'dish-2',
      createdById: 'user-1',
      localVideoFilename: null,
    };
    mockDb.select.mockReturnValue(makeSelectChain([fakeDish]));
    mockDb.update.mockReturnValue(makeUpdateChain());

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dishes/dish-2/video',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it("returns 204 when admin deletes another user's video", async () => {
    const fakeDish = {
      id: 'dish-3',
      createdById: 'other-user',
      localVideoFilename: 'other.mp4',
    };
    mockDb.select.mockReturnValue(makeSelectChain([fakeDish]));
    mockDeleteVideo.mockResolvedValue(undefined);
    mockDb.update.mockReturnValue(makeUpdateChain());

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dishes/dish-3/video',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 403 when non-owner non-admin tries to delete', async () => {
    const fakeDish = {
      id: 'dish-4',
      createdById: 'other-user',
      localVideoFilename: 'video.mp4',
    };
    mockDb.select.mockReturnValue(makeSelectChain([fakeDish]));

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dishes/dish-4/video',
      headers: bearerHeader(app, 'member'),
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Forbidden' });
  });

  it('returns 404 when dish does not exist', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dishes/ghost-dish/video',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Dish not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dishes/dish-1/video',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/dishes/:id/video — basic 404 tests (no actual file streaming)
// ===========================================================================

describe('GET /api/dishes/:id/video', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 404 when dish does not exist', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/ghost-dish/video',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Dish not found' });
  });

  it('returns 404 when dish has no local video', async () => {
    const fakeDish = { id: 'dish-1', createdById: 'user-1', localVideoFilename: null };
    mockDb.select.mockReturnValue(makeSelectChain([fakeDish]));

    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1/video',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'No local video for this dish' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1/video',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/admin/cleanup-videos
// ===========================================================================

import * as videoCleanupService from '../services/videoCleanup.js';
const mockCleanupOrphanedVideos = vi.mocked(videoCleanupService.cleanupOrphanedVideos);

describe('POST /api/admin/cleanup-videos', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/cleanup-videos' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when called by a non-admin member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/cleanup-videos',
      headers: bearerHeader(app, 'member'),
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Admin access required' });
  });

  it('returns cleanup result for admin', async () => {
    const fakeResult = { deletedFiles: ['abc.mp4'], freedBytes: 1024, errors: [] };
    mockCleanupOrphanedVideos.mockResolvedValueOnce(fakeResult);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/cleanup-videos',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(fakeResult);
    expect(mockCleanupOrphanedVideos).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// dinner-5vx: family scoping, raw fields, URL normalisation, re-extract
// ===========================================================================

type JobRow = Awaited<ReturnType<typeof videoJobsService.getVideoJobForFamily>>;
const asJob = (j: Record<string, unknown>) => j as unknown as JobRow;

describe('GET /api/jobs/:id — scoping and new fields', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("looks the job up by the caller's family and 404s when it belongs to another family", async () => {
    mockGetVideoJob.mockResolvedValue(null);
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/other-fam-job',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
    expect(mockGetVideoJob).toHaveBeenCalledWith('other-fam-job', 'fam-1');
  });

  it('exposes rawTitle, rawDescription, extraction fields and warning', async () => {
    mockGetVideoJob.mockResolvedValue(
      asJob({
        id: 'j1',
        status: 'complete',
        resultMetadata: JSON.stringify({
          infoJson: { title: 'Pizza Tacos', description: 'Pepperoni and tortillas' },
        }),
        extractedRecipe: null,
        extractionStatus: 'failed',
        extractionError: 'The AI model returned an error (HTTP 500)',
        warning: 'Video could not be downloaded; recipe extracted from the post description',
      })
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j1',
      headers: bearerHeader(app),
    });
    const { job } = JSON.parse(res.body);
    expect(job.rawTitle).toBe('Pizza Tacos');
    expect(job.rawDescription).toBe('Pepperoni and tortillas');
    expect(job.extractionStatus).toBe('failed');
    expect(job.extractionError).toBe('The AI model returned an error (HTTP 500)');
    expect(job.warning).toContain('Video could not be downloaded');
    expect(job.extractedRecipe).toBeNull();
  });

  it('returns null raw fields when there is no stored metadata', async () => {
    mockGetVideoJob.mockResolvedValue(asJob({ id: 'j2', status: 'pending', resultMetadata: null }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j2',
      headers: bearerHeader(app),
    });
    const { job } = JSON.parse(res.body);
    expect(job.rawTitle).toBeNull();
    expect(job.rawDescription).toBeNull();
  });
});

describe('POST /api/dishes/import-video-url — normalisation', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('records the normalised TikTok URL and the caller family on the job', async () => {
    mockGetSettings.mockResolvedValue({ videoStorageLimitMb: 1024 } as never);
    mockCreateVideoJob.mockResolvedValue('job-n');
    vi.mocked(videoJobsService.processVideoJob).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-video-url',
      headers: jsonHeaders(app),
      payload: { url: 'https://www.tiktok.com/ZPLhqTVQL' },
    });

    expect(res.statusCode).toBe(202);
    expect(mockCreateVideoJob).toHaveBeenCalledWith(
      'https://www.tiktok.com/t/ZPLhqTVQL/',
      undefined,
      'fam-1'
    );
  });
});

describe('POST /api/jobs/:id/extract', () => {
  let app: TestApp;
  const mockReextract = vi.mocked(videoJobsService.reextractVideoJob);
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    mockGetVideoJob.mockReset();
    mockReextract.mockReset();
  });

  it('401s without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs/j1/extract' });
    expect(res.statusCode).toBe(401);
  });

  it('404s for another family (and does not run extraction)', async () => {
    mockGetVideoJob.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/j1/extract',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
    expect(mockGetVideoJob).toHaveBeenCalledWith('j1', 'fam-1');
    expect(mockReextract).not.toHaveBeenCalled();
  });

  it('409s when the job is not complete / has no stored metadata', async () => {
    mockGetVideoJob.mockResolvedValue(
      asJob({ id: 'j1', status: 'downloading', resultMetadata: null })
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/j1/extract',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(409);
    expect(mockReextract).not.toHaveBeenCalled();
  });

  it('re-runs extraction and returns the updated job', async () => {
    const base = {
      id: 'j1',
      status: 'complete',
      resultMetadata: JSON.stringify({ infoJson: { title: 'T', description: 'D' } }),
    };
    mockGetVideoJob.mockResolvedValue(asJob({ ...base, extractionStatus: 'failed' }));
    mockReextract.mockResolvedValue(
      asJob({
        ...base,
        extractedRecipe: JSON.stringify({ name: 'R' }),
        extractionStatus: 'llm',
        extractionError: null,
      })
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/j1/extract',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    const { job } = JSON.parse(res.body);
    expect(mockReextract).toHaveBeenCalledWith('j1');
    expect(job.extractionStatus).toBe('llm');
    expect(job.extractedRecipe).toEqual({ name: 'R' });
    expect(job.rawTitle).toBe('T');
  });
});
