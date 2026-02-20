/**
 * API integration tests using Fastify's inject() for HTTP-level testing.
 * Services are mocked entirely so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { healthRoutes } from '../routes/health.js';
import { patternsRoutes } from '../routes/patterns.js';
import { dishesRoutes } from '../routes/dishes.js';

// Mock all service modules so no SQLite bindings are loaded
vi.mock('../services/patterns.js', () => ({
  listPatterns: vi.fn(),
  getPattern: vi.fn(),
  createPattern: vi.fn(),
  updatePattern: vi.fn(),
  deletePattern: vi.fn(),
  applyPatternsToWeek: vi.fn(),
}));

vi.mock('../services/menus.js', () => ({
  getOrCreateWeekMenu: vi.fn(),
}));

vi.mock('../services/dishes.js', () => ({
  getDishes: vi.fn(),
  getDishById: vi.fn(),
  createDish: vi.fn(),
  updateDish: vi.fn(),
  archiveDish: vi.fn(),
  unarchiveDish: vi.fn(),
  deleteDish: vi.fn(),
  getAllTags: vi.fn(),
}));

vi.mock('../services/recipeImport.js', () => ({
  importRecipeFromUrl: vi.fn(),
  validateRecipeUrl: vi.fn().mockReturnValue(true),
}));

import { listPatterns, getPattern, createPattern, updatePattern, deletePattern } from '../services/patterns.js';
import { getDishes, getDishById, createDish } from '../services/dishes.js';
import { importRecipeFromUrl } from '../services/recipeImport.js';

// --- Test app setup ---

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(patternsRoutes);
  await app.register(dishesRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp, role: 'admin' | 'member' = 'member') {
  const token = app.jwt.sign({ userId: 'user-1', username: 'testuser', role });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp, role: 'admin' | 'member' = 'member') {
  return {
    ...bearerHeader(app, role),
    'content-type': 'application/json',
  };
}

// --- Fixtures ---

const mockPattern = {
  id: 'pat-1',
  label: 'Test Pattern',
  dayOfWeek: 1,
  type: 'assembled',
  mainDishId: null,
  mainDish: null,
  sideDishIds: [],
  sideDishes: [],
  customText: null,
  createdById: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockDish = {
  id: 'dish-1',
  name: 'Pasta',
  type: 'main',
  description: '',
  instructions: '',
  prepTime: null,
  cookTime: null,
  servings: null,
  sourceUrl: null,
  videoUrl: null,
  archived: false,
  createdById: 'user-1',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ingredients: [],
  tags: [],
};

// ===========================================================================
// Health check
// ===========================================================================

describe('GET /health', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok' });
  });

  it('GET /api/v1/health returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
// Authentication guard
// ===========================================================================

describe('Authentication guard', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/patterns' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is malformed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/patterns',
      headers: { Authorization: 'Bearer not.a.valid.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is signed with wrong secret', async () => {
    // Build a separate app with a different secret to generate a bad token
    const otherApp = Fastify({ logger: false });
    await otherApp.register(jwtPlugin, { secret: 'wrong-secret-must-also-be-32-chars!!' });
    await otherApp.ready();
    const badToken = otherApp.jwt.sign({ userId: 'u1', username: 'u', role: 'member' });
    await otherApp.close();

    const res = await app.inject({
      method: 'GET',
      url: '/api/patterns',
      headers: { Authorization: `Bearer ${badToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// Patterns CRUD
// ===========================================================================

describe('Patterns routes', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('GET /api/patterns → 200 with patterns array', async () => {
    vi.mocked(listPatterns).mockResolvedValueOnce([mockPattern]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/patterns',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ patterns: [mockPattern] });
  });

  it('GET /api/patterns → 200 with empty array', async () => {
    vi.mocked(listPatterns).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/patterns',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ patterns: [] });
  });

  it('GET /api/patterns/:id → 200 when found', async () => {
    vi.mocked(getPattern).mockResolvedValueOnce(mockPattern);

    const res = await app.inject({
      method: 'GET',
      url: '/api/patterns/pat-1',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ pattern: mockPattern });
  });

  it('GET /api/patterns/:id → 404 when not found', async () => {
    vi.mocked(getPattern).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/patterns/nonexistent',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Pattern not found' });
  });

  it('POST /api/patterns → 201 with valid body', async () => {
    vi.mocked(createPattern).mockResolvedValueOnce(mockPattern);

    const res = await app.inject({
      method: 'POST',
      url: '/api/patterns',
      headers: jsonHeaders(app),
      body: JSON.stringify({ label: 'Test Pattern', dayOfWeek: 1, type: 'assembled', sideDishIds: [] }),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ pattern: mockPattern });
  });

  it('POST /api/patterns → 400 with invalid body (missing required fields)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patterns',
      headers: jsonHeaders(app),
      body: JSON.stringify({ label: '' }), // missing dayOfWeek, type
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('PATCH /api/patterns/:id → 200 when found', async () => {
    vi.mocked(updatePattern).mockResolvedValueOnce({ ...mockPattern, label: 'Updated' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/patterns/pat-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ label: 'Updated' }),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).pattern.label).toBe('Updated');
  });

  it('PATCH /api/patterns/:id → 404 when not found', async () => {
    vi.mocked(updatePattern).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/patterns/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ label: 'Updated' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/patterns/:id → 200 when deleted', async () => {
    vi.mocked(deletePattern).mockResolvedValueOnce(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/patterns/pat-1',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it('DELETE /api/patterns/:id → 404 when not found', async () => {
    vi.mocked(deletePattern).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/patterns/nonexistent',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// Dishes routes
// ===========================================================================

describe('Dishes routes', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('GET /api/dishes → 200 with dishes and total', async () => {
    vi.mocked(getDishes).mockResolvedValueOnce({ dishes: [mockDish], total: 1 });

    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ dishes: [mockDish], total: 1 });
  });

  it('GET /api/dishes/:id → 200 when found', async () => {
    vi.mocked(getDishById).mockResolvedValueOnce(mockDish);

    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/dishes/:id → 404 when not found', async () => {
    vi.mocked(getDishById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/nonexistent',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/dishes → 201 with valid body', async () => {
    vi.mocked(createDish).mockResolvedValueOnce(mockDish);

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Pasta', type: 'main', description: '', instructions: '', ingredients: [], tags: [] }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/dishes → 400 with invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }), // missing required type
    });
    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// Recipe import endpoint
// ===========================================================================

describe('POST /api/dishes/import-url', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 for missing url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({ url: 'not-a-url' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 422 when import service throws', async () => {
    vi.mocked(importRecipeFromUrl).mockRejectedValueOnce(new Error('No recipe data found'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({ url: 'https://example.com/recipe' }),
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'No recipe data found' });
  });

  it('returns 200 with recipe on success', async () => {
    const importedRecipe = {
      name: 'Pasta',
      description: 'Delicious',
      type: 'main',
      ingredients: [],
      instructions: 'Cook it',
      prepTime: 15,
      cookTime: 30,
      servings: 4,
      sourceUrl: 'https://example.com/recipe',
      videoUrl: null,
      tags: ['italian'],
    };
    vi.mocked(importRecipeFromUrl).mockResolvedValueOnce(importedRecipe);

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({ url: 'https://example.com/recipe' }),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ recipe: importedRecipe });
  });
});
