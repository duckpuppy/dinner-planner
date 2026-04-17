/**
 * Route integration tests for restaurants using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { restaurantsRoutes } from '../routes/restaurants.js';

vi.mock('../services/restaurants.js', () => ({
  listRestaurants: vi.fn(),
  getRestaurantById: vi.fn(),
  createRestaurant: vi.fn(),
  updateRestaurant: vi.fn(),
  deleteRestaurant: vi.fn(),
}));

vi.mock('../services/restaurantDishes.js', () => ({
  listDishesByRestaurant: vi.fn(),
  createRestaurantDish: vi.fn(),
  updateRestaurantDish: vi.fn(),
  deleteRestaurantDish: vi.fn(),
  getDishRatings: vi.fn(),
  addDishRating: vi.fn(),
  updateDishRating: vi.fn(),
}));

import * as restaurantsService from '../services/restaurants.js';
import * as restaurantDishesService from '../services/restaurantDishes.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(restaurantsRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp) {
  const token = app.jwt.sign({ userId: 'user-1', username: 'alice', role: 'member' });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp) {
  return { ...bearerHeader(app), 'content-type': 'application/json' };
}

const mockRestaurant = {
  id: 'rest-1',
  name: 'The Test Kitchen',
  cuisineType: 'Italian',
  location: '123 Main St',
  notes: null,
  archived: false,
  createdBy: { id: 'user-1', displayName: 'Alice' },
  visitCount: 2,
  averageRating: 4.5,
  lastVisitedAt: '2024-06-01',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockDish = {
  id: 'dish-1',
  restaurantId: 'rest-1',
  name: 'Margherita Pizza',
  notes: null,
  averageRating: 4,
  ratingCount: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockRating = {
  id: 'rating-1',
  restaurantDishId: 'dish-1',
  user: { id: 'user-1', displayName: 'Alice' },
  stars: 4,
  note: 'Great pizza',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ===========================================================================
// GET /api/restaurants
// ===========================================================================

describe('GET /api/restaurants', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with restaurants list', async () => {
    vi.mocked(restaurantsService.listRestaurants).mockResolvedValueOnce({
      restaurants: [mockRestaurant],
      total: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.restaurants).toHaveLength(1);
    expect(body.restaurants[0].id).toBe('rest-1');
    expect(body.total).toBe(1);
  });

  it('returns 200 with empty list', async () => {
    vi.mocked(restaurantsService.listRestaurants).mockResolvedValueOnce({
      restaurants: [],
      total: 0,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ restaurants: [], total: 0 });
  });

  it('returns 400 with invalid query param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants?sort=invalid',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/restaurants' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/restaurants
// ===========================================================================

describe('POST /api/restaurants', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with created restaurant', async () => {
    vi.mocked(restaurantsService.createRestaurant).mockResolvedValueOnce(mockRestaurant);

    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'The Test Kitchen', cuisineType: 'Italian' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('rest-1');
    expect(body.name).toBe('The Test Kitchen');
  });

  it('returns 400 with missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants',
      headers: jsonHeaders(app),
      body: JSON.stringify({ cuisineType: 'Italian' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 400 with empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/restaurants/:id
// ===========================================================================

describe('GET /api/restaurants/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with restaurant', async () => {
    vi.mocked(restaurantsService.getRestaurantById).mockResolvedValueOnce(mockRestaurant);

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants/rest-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('rest-1');
    expect(body.name).toBe('The Test Kitchen');
  });

  it('returns 404 when restaurant not found', async () => {
    vi.mocked(restaurantsService.getRestaurantById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Restaurant not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/restaurants/rest-1' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PUT /api/restaurants/:id
// ===========================================================================

describe('PUT /api/restaurants/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with updated restaurant', async () => {
    const updated = { ...mockRestaurant, name: 'Updated Kitchen' };
    vi.mocked(restaurantsService.updateRestaurant).mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Updated Kitchen' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated Kitchen');
  });

  it('returns 404 when restaurant not found', async () => {
    vi.mocked(restaurantsService.updateRestaurant).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Updated Kitchen' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Restaurant not found' });
  });

  it('returns 400 with invalid body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/restaurants/:id
// ===========================================================================

describe('DELETE /api/restaurants/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 204 on success', async () => {
    vi.mocked(restaurantsService.deleteRestaurant).mockResolvedValueOnce({ success: true });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/restaurants/rest-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when restaurant not found', async () => {
    vi.mocked(restaurantsService.deleteRestaurant).mockResolvedValueOnce({
      success: false,
      error: 'Restaurant not found',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/restaurants/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Restaurant not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/restaurants/rest-1' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/restaurants/:id/dishes
// ===========================================================================

describe('GET /api/restaurants/:id/dishes', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with dishes list', async () => {
    vi.mocked(restaurantDishesService.listDishesByRestaurant).mockResolvedValueOnce([mockDish]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants/rest-1/dishes',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dishes).toHaveLength(1);
    expect(body.dishes[0].id).toBe('dish-1');
  });

  it('returns 200 with empty dishes list', async () => {
    vi.mocked(restaurantDishesService.listDishesByRestaurant).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants/rest-1/dishes',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ dishes: [] });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/restaurants/rest-1/dishes' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/restaurants/:id/dishes
// ===========================================================================

describe('POST /api/restaurants/:id/dishes', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with created dish', async () => {
    vi.mocked(restaurantDishesService.createRestaurantDish).mockResolvedValueOnce(mockDish);

    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Margherita Pizza' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('dish-1');
    expect(body.name).toBe('Margherita Pizza');
  });

  it('returns 400 with missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ notes: 'Some notes' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 400 with empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Pizza' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PUT /api/restaurants/:restaurantId/dishes/:dishId
// ===========================================================================

describe('PUT /api/restaurants/:restaurantId/dishes/:dishId', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with updated dish', async () => {
    const updated = { ...mockDish, name: 'Pepperoni Pizza' };
    vi.mocked(restaurantDishesService.updateRestaurantDish).mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/dish-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Pepperoni Pizza' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Pepperoni Pizza');
  });

  it('returns 404 when dish not found', async () => {
    vi.mocked(restaurantDishesService.updateRestaurantDish).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Pizza' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Dish not found' });
  });

  it('returns 400 with empty name', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/dish-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/dish-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Pizza' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/restaurants/:restaurantId/dishes/:dishId
// ===========================================================================

describe('DELETE /api/restaurants/:restaurantId/dishes/:dishId', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 204 on success', async () => {
    vi.mocked(restaurantDishesService.deleteRestaurantDish).mockResolvedValueOnce({
      success: true,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/restaurants/rest-1/dishes/dish-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when dish not found', async () => {
    vi.mocked(restaurantDishesService.deleteRestaurantDish).mockResolvedValueOnce({
      success: false,
      error: 'Dish not found',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/restaurants/rest-1/dishes/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Dish not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/restaurants/rest-1/dishes/dish-1',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/restaurants/:restaurantId/dishes/:dishId/ratings
// ===========================================================================

describe('GET /api/restaurants/:restaurantId/dishes/:dishId/ratings', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with ratings list', async () => {
    vi.mocked(restaurantDishesService.getDishRatings).mockResolvedValueOnce([mockRating]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ratings).toHaveLength(1);
    expect(body.ratings[0].id).toBe('rating-1');
  });

  it('returns 200 with empty ratings list', async () => {
    vi.mocked(restaurantDishesService.getDishRatings).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ratings: [] });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/restaurants/:restaurantId/dishes/:dishId/ratings
// ===========================================================================

describe('POST /api/restaurants/:restaurantId/dishes/:dishId/ratings', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with created rating', async () => {
    vi.mocked(restaurantDishesService.addDishRating).mockResolvedValueOnce(mockRating);

    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 4, note: 'Great pizza' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('rating-1');
    expect(body.stars).toBe(4);
  });

  it('returns 400 with missing stars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings',
      headers: jsonHeaders(app),
      body: JSON.stringify({ note: 'Great pizza' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 400 with out-of-range stars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 6 }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stars: 4 }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PUT /api/restaurants/:restaurantId/dishes/:dishId/ratings/:ratingId
// ===========================================================================

describe('PUT /api/restaurants/:restaurantId/dishes/:dishId/ratings/:ratingId', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with updated rating', async () => {
    const updated = { ...mockRating, stars: 5 };
    vi.mocked(restaurantDishesService.updateDishRating).mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings/rating-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 5 }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.stars).toBe(5);
  });

  it('returns 404 when rating not found', async () => {
    vi.mocked(restaurantDishesService.updateDishRating).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 5 }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Rating not found' });
  });

  it('returns 400 with out-of-range stars', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings/rating-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ stars: 0 }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation failed' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/restaurants/rest-1/dishes/dish-1/ratings/rating-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stars: 5 }),
    });
    expect(res.statusCode).toBe(401);
  });
});
