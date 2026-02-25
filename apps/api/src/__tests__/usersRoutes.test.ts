/**
 * Route integration tests for users using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { usersRoutes } from '../routes/users.js';

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

import * as usersService from '../services/users.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(usersRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function memberHeader(app: TestApp, userId = 'user-1') {
  const token = app.jwt.sign({ userId, username: 'alice', role: 'member' });
  return { Authorization: `Bearer ${token}` };
}

function adminHeader(app: TestApp, userId = 'admin-1') {
  const token = app.jwt.sign({ userId, username: 'admin', role: 'admin' });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp, role: 'member' | 'admin' = 'admin', userId?: string) {
  const base = role === 'admin' ? adminHeader(app, userId) : memberHeader(app, userId);
  return { ...base, 'content-type': 'application/json' };
}

const mockUser = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice',
  role: 'member' as const,
  theme: 'light' as const,
  homeView: 'today' as const,
  dietaryPreferences: [],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

// ===========================================================================
// GET /api/users
// ===========================================================================

describe('GET /api/users', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with users list for admin', async () => {
    vi.mocked(usersService.getAllUsers).mockResolvedValueOnce([mockUser]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).users).toHaveLength(1);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: memberHeader(app),
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/users/:id
// ===========================================================================

describe('GET /api/users/:id', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user views own profile', async () => {
    vi.mocked(usersService.getUserById).mockResolvedValueOnce(mockUser);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/user-1',
      headers: memberHeader(app, 'user-1'),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.id).toBe('user-1');
  });

  it('returns 200 when admin views any user', async () => {
    vi.mocked(usersService.getUserById).mockResolvedValueOnce(mockUser);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/user-1',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 403 when non-admin views other user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/user-2',
      headers: memberHeader(app, 'user-1'),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(usersService.getUserById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/nonexistent',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// POST /api/users
// ===========================================================================

describe('POST /api/users', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 201 when admin creates user', async () => {
    vi.mocked(usersService.createUser).mockResolvedValueOnce(mockUser);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: jsonHeaders(app),
      body: JSON.stringify({
        username: 'alice',
        displayName: 'Alice',
        password: 'password123',
        role: 'member',
      }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).user.id).toBe('user-1');
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: jsonHeaders(app),
      body: JSON.stringify({ username: '' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when username already exists', async () => {
    vi.mocked(usersService.createUser).mockRejectedValueOnce(
      new Error('Username already exists')
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: jsonHeaders(app),
      body: JSON.stringify({
        username: 'alice',
        displayName: 'Alice',
        password: 'password123',
        role: 'member',
      }),
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: jsonHeaders(app, 'member'),
      body: JSON.stringify({
        username: 'alice',
        displayName: 'Alice',
        password: 'password123',
        role: 'member',
      }),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ===========================================================================
// PATCH /api/users/:id
// ===========================================================================

describe('PATCH /api/users/:id', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin updates user', async () => {
    vi.mocked(usersService.updateUser).mockResolvedValueOnce({ ...mockUser, displayName: 'Bob' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/user-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ displayName: 'Bob' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.displayName).toBe('Bob');
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(usersService.updateUser).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ displayName: 'Bob' }),
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/user-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ role: 'superuser' }),
    });

    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// PATCH /api/users/:id/preferences
// ===========================================================================

describe('PATCH /api/users/:id/preferences', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user updates own preferences', async () => {
    vi.mocked(usersService.updateUserPreferences).mockResolvedValueOnce({
      ...mockUser,
      theme: 'dark' as const,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/user-1/preferences',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ theme: 'dark', homeView: 'week' }),
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 403 when user updates another user preferences', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/user-2/preferences',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ theme: 'dark', homeView: 'week' }),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/user-1/preferences',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ theme: 'invalid-theme' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(usersService.updateUserPreferences).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/user-1/preferences',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ theme: 'dark', homeView: 'week' }),
    });

    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// POST /api/users/:id/change-password
// ===========================================================================

describe('POST /api/users/:id/change-password', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on success', async () => {
    vi.mocked(usersService.changePassword).mockResolvedValueOnce({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/user-1/change-password',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ currentPassword: 'oldpass', newPassword: 'newpass123' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('returns 403 when changing another user password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/user-2/change-password',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ currentPassword: 'oldpass', newPassword: 'newpass123' }),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when current password is wrong', async () => {
    vi.mocked(usersService.changePassword).mockResolvedValueOnce({
      success: false,
      error: 'Current password is incorrect',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/user-1/change-password',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpass123' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/user-1/change-password',
      headers: jsonHeaders(app, 'member', 'user-1'),
      body: JSON.stringify({ currentPassword: 'old', newPassword: 'short' }),
    });

    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// POST /api/users/:id/reset-password
// ===========================================================================

describe('POST /api/users/:id/reset-password', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin resets password', async () => {
    vi.mocked(usersService.resetPassword).mockResolvedValueOnce({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/user-1/reset-password',
      headers: jsonHeaders(app),
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(usersService.resetPassword).mockResolvedValueOnce({
      success: false,
      error: 'User not found',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/nonexistent/reset-password',
      headers: jsonHeaders(app),
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/user-1/reset-password',
      headers: jsonHeaders(app),
      body: JSON.stringify({ newPassword: 'short' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/user-1/reset-password',
      headers: jsonHeaders(app, 'member'),
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ===========================================================================
// DELETE /api/users/:id
// ===========================================================================

describe('DELETE /api/users/:id', () => {
  let app: TestApp;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin deletes user', async () => {
    vi.mocked(usersService.deleteUser).mockResolvedValueOnce({ success: true });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/user-1',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(usersService.deleteUser).mockResolvedValueOnce({
      success: false,
      error: 'User not found',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/nonexistent',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when deleting self', async () => {
    vi.mocked(usersService.deleteUser).mockResolvedValueOnce({
      success: false,
      error: 'Cannot delete your own account',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/admin-1',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/user-1',
      headers: memberHeader(app),
    });

    expect(res.statusCode).toBe(403);
  });
});
