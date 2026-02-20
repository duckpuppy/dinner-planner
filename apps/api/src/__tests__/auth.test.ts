import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bcrypt before any imports
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pw'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../config.js', () => ({
  config: {
    JWT_REFRESH_EXPIRY: '7d',
    JWT_ACCESS_EXPIRY: '15m',
    NODE_ENV: 'test',
  },
}));

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  delete: vi.fn(),
  query: {
    users: { findFirst: vi.fn() },
    refreshTokens: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  lt: vi.fn().mockReturnValue(null),
  gt: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    users: { id: null, username: null },
    refreshTokens: { id: null, userId: null, tokenHash: null, expiresAt: null },
  },
}));

import {
  hashPassword,
  verifyPassword,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
  cleanupExpiredTokens,
  getUserById,
} from '../services/auth.js';
import bcrypt from 'bcrypt';

function ins() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function del(changes = 0) {
  return { where: vi.fn().mockResolvedValue({ changes }) };
}

const mockUser = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice',
  role: 'member' as const,
  theme: 'light' as const,
  homeView: 'today' as const,
  passwordHash: 'hashed-pw',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockToken = {
  id: 'tok-1',
  userId: 'user-1',
  tokenHash: 'hash',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hashPassword', () => {
  it('calls bcrypt.hash and returns result', async () => {
    const result = await hashPassword('secret');
    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 12);
    expect(result).toBe('hashed-pw');
  });
});

describe('verifyPassword', () => {
  it('returns true when bcrypt.compare resolves true', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    const result = await verifyPassword('secret', 'hashed-pw');
    expect(result).toBe(true);
  });

  it('returns false when bcrypt.compare resolves false', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    const result = await verifyPassword('wrong', 'hashed-pw');
    expect(result).toBe(false);
  });
});

describe('login', () => {
  const signToken = vi.fn().mockReturnValue('access-token');

  it('returns null when user not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await login('alice', 'pass', signToken);
    expect(result).toBeNull();
  });

  it('returns null when password is invalid', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    const result = await login('alice', 'wrongpass', signToken);
    expect(result).toBeNull();
  });

  it('returns AuthResult on success', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    mockDb.insert.mockReturnValueOnce(ins());

    const result = await login('alice', 'secret', signToken);

    expect(result).not.toBeNull();
    expect(result!.user.id).toBe('user-1');
    expect(result!.user.username).toBe('alice');
    expect(result!.accessToken).toBe('access-token');
    expect(typeof result!.refreshToken).toBe('string');
    expect(result!.refreshToken).toHaveLength(64); // 32 bytes hex
  });

  it('signs access token with correct payload', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    mockDb.insert.mockReturnValueOnce(ins());

    await login('alice', 'secret', signToken);

    expect(signToken).toHaveBeenCalledWith({
      userId: 'user-1',
      username: 'alice',
      role: 'member',
    });
  });
});

describe('refreshAccessToken', () => {
  const signToken = vi.fn().mockReturnValue('new-access-token');

  it('returns null when token not found', async () => {
    mockDb.query.refreshTokens.findFirst.mockResolvedValueOnce(null);
    const result = await refreshAccessToken('invalid-token', signToken);
    expect(result).toBeNull();
  });

  it('returns null when user not found', async () => {
    mockDb.query.refreshTokens.findFirst.mockResolvedValueOnce(mockToken);
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await refreshAccessToken('valid-token', signToken);
    expect(result).toBeNull();
  });

  it('returns new accessToken and user on success', async () => {
    mockDb.query.refreshTokens.findFirst.mockResolvedValueOnce(mockToken);
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await refreshAccessToken('valid-token', signToken);

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe('new-access-token');
    expect(result!.user.id).toBe('user-1');
  });
});

describe('logout', () => {
  it('deletes the refresh token', async () => {
    mockDb.delete.mockReturnValueOnce(del());
    await logout('some-token');
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});

describe('logoutAll', () => {
  it('deletes all refresh tokens for a user', async () => {
    mockDb.delete.mockReturnValueOnce(del());
    await logoutAll('user-1');
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});

describe('cleanupExpiredTokens', () => {
  it('returns count of deleted tokens', async () => {
    mockDb.delete.mockReturnValueOnce(del(3));
    const count = await cleanupExpiredTokens();
    expect(count).toBe(3);
  });

  it('returns 0 when nothing deleted', async () => {
    mockDb.delete.mockReturnValueOnce(del(0));
    const count = await cleanupExpiredTokens();
    expect(count).toBe(0);
  });
});

describe('getUserById', () => {
  it('returns user when found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    const result = await getUserById('user-1');
    expect(result).toEqual(mockUser);
  });

  it('returns undefined when not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(undefined);
    const result = await getUserById('nonexistent');
    expect(result).toBeUndefined();
  });
});
