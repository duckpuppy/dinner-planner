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
import { authRoutes } from '../routes/auth.js';
import { settingsRoutes } from '../routes/settings.js';
import { menusRoutes } from '../routes/menus.js';
import { ratingsRoutes } from '../routes/ratings.js';
import { historyRoutes } from '../routes/history.js';
import { suggestionsRoutes } from '../routes/suggestions.js';
import { usersRoutes } from '../routes/users.js';

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
  getTodayEntry: vi.fn(),
  updateDinnerEntry: vi.fn(),
  markEntryCompleted: vi.fn(),
  logPreparation: vi.fn(),
  getDishPreparations: vi.fn(),
  deletePreparation: vi.fn(),
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
  SsrfBlockedError: class SsrfBlockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SsrfBlockedError';
    }
  },
}));

vi.mock('../services/auth.js', () => ({
  login: vi.fn(),
  refreshAccessToken: vi.fn(),
  logout: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('../services/settings.js', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('../services/history.js', () => ({
  getHistory: vi.fn(),
  getDishHistory: vi.fn(),
  deleteHistoryEntry: vi.fn(),
}));

vi.mock('../services/ratings.js', () => ({
  getRatingsForPreparation: vi.fn(),
  createRating: vi.fn(),
  updateRating: vi.fn(),
  deleteRating: vi.fn(),
  getDishRatingStats: vi.fn(),
}));

vi.mock('../services/suggestions.js', () => ({
  getSuggestions: vi.fn(),
}));

vi.mock('../services/users.js', () => ({
  getAllUsers: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  updateUserPreferences: vi.fn(),
  changePassword: vi.fn(),
  resetPassword: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('../services/groceries.js', () => ({
  getWeekGroceries: vi.fn(),
  getGroceriesForEntry: vi.fn(),
}));

import {
  listPatterns,
  getPattern,
  createPattern,
  updatePattern,
  deletePattern,
} from '../services/patterns.js';
import { getDishes, getDishById, createDish } from '../services/dishes.js';
import { importRecipeFromUrl, SsrfBlockedError } from '../services/recipeImport.js';
import * as authService from '../services/auth.js';
import * as settingsService from '../services/settings.js';
import * as menusService from '../services/menus.js';
import * as ratingsService from '../services/ratings.js';
import * as historyService from '../services/history.js';
import * as suggestionsService from '../services/suggestions.js';
import * as usersService from '../services/users.js';
import * as groceriesService from '../services/groceries.js';

// --- Test app setup ---

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(patternsRoutes);
  await app.register(dishesRoutes);
  await app.register(menusRoutes);
  await app.register(ratingsRoutes);
  await app.register(historyRoutes);
  await app.register(suggestionsRoutes);
  await app.register(usersRoutes);
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
  type: 'assembled' as const,
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
  type: 'main' as const,
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

const mockEntry = {
  id: 'entry-1',
  menuId: 'menu-1',
  date: '2024-01-15',
  dayOfWeek: 1,
  type: 'assembled' as const,
  customText: null,
  restaurantName: null,
  restaurantNotes: null,
  mainDishId: null,
  mainDish: null,
  sideDishes: [],
  completed: false,
  preparations: [],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockPreparation = {
  id: 'prep-1',
  dishId: 'dish-1',
  dishName: 'Pasta',
  dinnerEntryId: 'entry-1',
  preparedById: 'user-1',
  preparedByName: 'Alice',
  preparedDate: '2024-01-15',
  notes: null,
  ratings: [],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockRating = {
  id: 'rating-1',
  preparationId: 'prep-1',
  userId: 'user-1',
  userName: 'Alice',
  stars: 4,
  note: null,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockUser = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  role: 'member' as const,
  theme: 'light' as const,
  homeView: 'today' as const,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockSettings = {
  id: 'default',
  weekStartDay: 0,
  recencyWindowDays: 30,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

// ===========================================================================
// Health check
// ===========================================================================

describe('GET /health', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

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
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

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
// Auth routes
// ===========================================================================

describe('Auth routes', () => {
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

  it('POST /api/auth/login → 400 when body is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/auth/login → 401 when credentials invalid', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'wrong' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/login → 200 with user and token on success', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce({
      user: {
        id: 'u-1',
        username: 'alice',
        displayName: 'Alice',
        role: 'member',
        theme: 'light',
        homeView: 'today',
      },
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'secret' }),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      user: { username: 'alice' },
      accessToken: 'access-tok',
    });
  });

  it('POST /api/auth/refresh → 401 when no cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/refresh → 401 when token invalid', async () => {
    vi.mocked(authService.refreshAccessToken).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: 'bad-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/refresh → 200 on success', async () => {
    vi.mocked(authService.refreshAccessToken).mockResolvedValueOnce({
      accessToken: 'new-tok',
      user: {
        id: 'u-1',
        username: 'alice',
        displayName: 'Alice',
        role: 'member',
        theme: 'light',
        homeView: 'today',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: 'valid-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ accessToken: 'new-tok' });
  });

  it('POST /api/auth/logout → 200', async () => {
    vi.mocked(authService.logout).mockResolvedValueOnce(undefined);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { refreshToken: 'some-token' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/auth/me → 200 with user data', async () => {
    vi.mocked(authService.getUserById).mockResolvedValueOnce(
      mockUser as ReturnType<typeof authService.getUserById> extends Promise<infer T> ? T : never
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ user: { username: 'testuser' } });
  });

  it('GET /api/auth/me → 404 when user not found', async () => {
    vi.mocked(authService.getUserById).mockResolvedValueOnce(undefined);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// Settings routes
// ===========================================================================

describe('Settings routes', () => {
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

  it('GET /api/settings → 200', async () => {
    vi.mocked(settingsService.getSettings).mockResolvedValueOnce(mockSettings);
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ settings: { weekStartDay: 0 } });
  });

  it('PATCH /api/settings → 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: jsonHeaders(app, 'member'),
      body: JSON.stringify({ weekStartDay: 1 }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH /api/settings → 200 for admin', async () => {
    vi.mocked(settingsService.updateSettings).mockResolvedValueOnce({
      ...mockSettings,
      weekStartDay: 1,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: jsonHeaders(app, 'admin'),
      body: JSON.stringify({ weekStartDay: 1 }),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ settings: { weekStartDay: 1 } });
  });
});

// ===========================================================================
// Patterns CRUD
// ===========================================================================

describe('Patterns routes', () => {
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
      body: JSON.stringify({
        label: 'Test Pattern',
        dayOfWeek: 1,
        type: 'assembled',
        sideDishIds: [],
      }),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ pattern: mockPattern });
  });

  it('POST /api/patterns → 400 with invalid body (missing required fields)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patterns',
      headers: jsonHeaders(app),
      body: JSON.stringify({ label: '' }),
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
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      body: JSON.stringify({
        name: 'Pasta',
        type: 'main',
        description: '',
        instructions: '',
        ingredients: [],
        tags: [],
      }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/dishes → 400 with invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// Recipe import endpoint
// ===========================================================================

describe('POST /api/dishes/import-url', () => {
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

  it('returns 400 when import service throws SsrfBlockedError', async () => {
    vi.mocked(importRecipeFromUrl).mockRejectedValueOnce(
      new SsrfBlockedError('URL not allowed: private or loopback addresses are blocked')
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/import-url',
      headers: jsonHeaders(app),
      body: JSON.stringify({ url: 'https://example.com/recipe' }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({
      error: 'URL not allowed: private or loopback addresses are blocked',
    });
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
      type: 'main' as const,
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

// ===========================================================================
// Menus routes
// ===========================================================================

describe('Menus routes', () => {
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

  const mockMenu = {
    id: 'menu-1',
    weekStartDate: '2024-01-15',
    entries: [mockEntry],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  it('GET /api/menus/week/:date → 400 for invalid date', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/menus/week/not-a-date',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/menus/week/:date → 200 with menu', async () => {
    vi.mocked(menusService.getOrCreateWeekMenu).mockResolvedValueOnce(mockMenu);
    const res = await app.inject({
      method: 'GET',
      url: '/api/menus/week/2024-01-15',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ menu: { id: 'menu-1' } });
  });

  it('GET /api/menus/week/:date/groceries → 200', async () => {
    vi.mocked(groceriesService.getWeekGroceries).mockResolvedValueOnce({
      groceries: [],
      weekStartDate: '2024-01-15',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/menus/week/2024-01-15/groceries',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/menus/today → 404 when no entry', async () => {
    vi.mocked(menusService.getTodayEntry).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'GET',
      url: '/api/menus/today',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/menus/today → 200 with entry', async () => {
    vi.mocked(menusService.getTodayEntry).mockResolvedValueOnce(mockEntry);
    const res = await app.inject({
      method: 'GET',
      url: '/api/menus/today',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
  });

  it('PATCH /api/entries/:id → 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/entries/entry-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ type: 'invalid-type' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/entries/:id → 404 when not found', async () => {
    vi.mocked(menusService.updateDinnerEntry).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/entries/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ type: 'assembled' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/entries/:id → 200 on success', async () => {
    vi.mocked(menusService.updateDinnerEntry).mockResolvedValueOnce(mockEntry);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/entries/entry-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ type: 'assembled' }),
    });
    expect(res.statusCode).toBe(200);
  });

  it('PATCH /api/entries/:id/completed → 200', async () => {
    vi.mocked(menusService.markEntryCompleted).mockResolvedValueOnce(mockEntry);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/entries/entry-1/completed',
      headers: jsonHeaders(app),
      body: JSON.stringify({ completed: true }),
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/preparations → 201 on success', async () => {
    vi.mocked(menusService.logPreparation).mockResolvedValueOnce(mockPreparation);
    const res = await app.inject({
      method: 'POST',
      url: '/api/preparations',
      headers: jsonHeaders(app),
      body: JSON.stringify({
        dishId: '00000000-0000-0000-0000-000000000001',
        dinnerEntryId: '00000000-0000-0000-0000-000000000002',
        preparedById: '00000000-0000-0000-0000-000000000003',
      }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('DELETE /api/preparations/:id → 404 when not found', async () => {
    vi.mocked(menusService.deletePreparation).mockResolvedValueOnce({
      success: false,
      error: 'Not found',
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/preparations/nonexistent',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/preparations/:id → 200 on success', async () => {
    vi.mocked(menusService.deletePreparation).mockResolvedValueOnce({ success: true });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/preparations/prep-1',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
// Ratings routes
// ===========================================================================

describe('Ratings routes', () => {
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

  it('GET /api/preparations/:id/ratings → 200', async () => {
    vi.mocked(ratingsService.getRatingsForPreparation).mockResolvedValueOnce([mockRating]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/preparations/prep-1/ratings',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ratings: [{ id: 'rating-1' }] });
  });

  it('POST /api/preparations/:id/ratings → 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preparations/prep-1/ratings',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 6 }), // stars must be 1-5
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/preparations/:id/ratings → 404 when prep not found', async () => {
    vi.mocked(ratingsService.createRating).mockRejectedValueOnce(
      new Error('Preparation not found')
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/preparations/nonexistent/ratings',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 4 }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/preparations/:id/ratings → 409 when already rated', async () => {
    vi.mocked(ratingsService.createRating).mockRejectedValueOnce(
      new Error('You have already rated this preparation')
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/preparations/prep-1/ratings',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 4 }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/preparations/:id/ratings → 201 on success', async () => {
    vi.mocked(ratingsService.createRating).mockResolvedValueOnce(mockRating);
    const res = await app.inject({
      method: 'POST',
      url: '/api/preparations/prep-1/ratings',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 4 }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('PATCH /api/ratings/:id → 403 when not owner', async () => {
    vi.mocked(ratingsService.updateRating).mockRejectedValueOnce(
      new Error('You can only edit your own ratings')
    );
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/ratings/rating-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 5 }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH /api/ratings/:id → 200 on success', async () => {
    vi.mocked(ratingsService.updateRating).mockResolvedValueOnce({ ...mockRating, stars: 5 });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/ratings/rating-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 5 }),
    });
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /api/ratings/:id → 404 when not found', async () => {
    vi.mocked(ratingsService.deleteRating).mockResolvedValueOnce({
      success: false,
      error: 'Rating not found',
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/ratings/nonexistent',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/ratings/:id → 200 on success', async () => {
    vi.mocked(ratingsService.deleteRating).mockResolvedValueOnce({ success: true });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/ratings/rating-1',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/dishes/:id/rating-stats → 200', async () => {
    vi.mocked(ratingsService.getDishRatingStats).mockResolvedValueOnce({
      averageRating: 4.2,
      totalRatings: 5,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1/rating-stats',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ stats: { averageRating: 4.2 } });
  });
});

// ===========================================================================
// History routes
// ===========================================================================

describe('History routes', () => {
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

  it('GET /api/history → 200 with entries', async () => {
    vi.mocked(historyService.getHistory).mockResolvedValueOnce({ entries: [], total: 0 });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ entries: [], total: 0 });
  });

  it('GET /api/dishes/:id/history → 200', async () => {
    vi.mocked(historyService.getDishHistory).mockResolvedValueOnce({ preparations: [] });
    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1/history',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /api/history/:id → 200', async () => {
    vi.mocked(historyService.deleteHistoryEntry).mockResolvedValueOnce({ success: true });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/history/entry-1',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ success: true });
  });
});

// ===========================================================================
// Suggestions routes
// ===========================================================================

describe('Suggestions routes', () => {
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

  it('GET /api/dishes/suggestions → 200', async () => {
    const mockSuggestion = {
      ...mockDish,
      avgRating: null,
      totalRatings: 0,
      lastPreparedDate: null,
      score: 1,
      reasons: [],
    };
    vi.mocked(suggestionsService.getSuggestions).mockResolvedValueOnce([mockSuggestion]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/suggestions',
      headers: bearerHeader(app),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ suggestions: [{ id: 'dish-1' }] });
  });
});

// ===========================================================================
// Users routes
// ===========================================================================

describe('Users routes', () => {
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

  it('GET /api/users → 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: bearerHeader(app, 'member'),
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/users → 200 for admin', async () => {
    vi.mocked(usersService.getAllUsers).mockResolvedValueOnce([mockUser]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: bearerHeader(app, 'admin'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ users: [{ id: 'user-1' }] });
  });

  it('GET /api/users/:id → 403 when non-admin accesses other user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/other-user',
      headers: bearerHeader(app, 'member'), // userId='user-1' from bearerHeader
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/users/:id → 200 when user accesses own profile', async () => {
    vi.mocked(usersService.getUserById).mockResolvedValueOnce(mockUser);
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/user-1', // same as JWT userId
      headers: bearerHeader(app, 'member'),
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/users/:id → 404 when not found', async () => {
    vi.mocked(usersService.getUserById).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/user-1',
      headers: bearerHeader(app, 'admin'),
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/users → 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: jsonHeaders(app, 'admin'),
      body: JSON.stringify({ username: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/users → 409 when username exists', async () => {
    vi.mocked(usersService.createUser).mockRejectedValueOnce(new Error('Username already exists'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: jsonHeaders(app, 'admin'),
      body: JSON.stringify({
        username: 'alice',
        displayName: 'Alice',
        password: 'secret123',
        role: 'member',
      }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/users → 201 on success', async () => {
    vi.mocked(usersService.createUser).mockResolvedValueOnce(mockUser);
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: jsonHeaders(app, 'admin'),
      body: JSON.stringify({
        username: 'newuser',
        displayName: 'New User',
        password: 'secret123',
        role: 'member',
      }),
    });
    expect(res.statusCode).toBe(201);
  });
});
