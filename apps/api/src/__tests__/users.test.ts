import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHashPassword = vi.hoisted(() => vi.fn().mockResolvedValue('hashed-pw'));
const mockVerifyPassword = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('../services/auth.js', () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    users: { findFirst: vi.fn() },
    refreshTokens: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn().mockReturnValue(null) }));
vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    users: { id: null, username: null },
    refreshTokens: { userId: null },
  },
}));

import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserPreferences,
  changePassword,
  resetPassword,
  deleteUser,
} from '../services/users.js';

function selFrom(result: unknown[]) {
  return { from: vi.fn().mockResolvedValue(result) };
}

function ins() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function updSetWhere() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

function del() {
  return { where: vi.fn().mockResolvedValue(undefined) };
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAllUsers', () => {
  it('returns mapped user list', async () => {
    mockDb.select.mockReturnValueOnce(selFrom([mockUser]));
    const result = await getAllUsers();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('user-1');
    expect((result[0] as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('returns empty array when no users', async () => {
    mockDb.select.mockReturnValueOnce(selFrom([]));
    const result = await getAllUsers();
    expect(result).toHaveLength(0);
  });
});

describe('getUserById', () => {
  it('returns user response when found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    const result = await getUserById('user-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('user-1');
  });

  it('returns null when not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await getUserById('nonexistent');
    expect(result).toBeNull();
  });
});

describe('createUser', () => {
  it('throws when username already exists', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    await expect(
      createUser({ username: 'alice', displayName: 'Alice', password: 'pass', role: 'member' })
    ).rejects.toThrow('Username already exists');
  });

  it('creates and returns user on success', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null); // no existing
    mockDb.insert.mockReturnValueOnce(ins());
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser); // post-insert fetch

    const result = await createUser({
      username: 'alice',
      displayName: 'Alice',
      password: 'secret',
      role: 'member',
    });

    expect(mockHashPassword).toHaveBeenCalledWith('secret');
    expect(result.username).toBe('alice');
  });
});

describe('updateUser', () => {
  it('returns null when user not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await updateUser('nonexistent', { displayName: 'Bob' });
    expect(result).toBeNull();
  });

  it('updates and returns user', async () => {
    const updated = { ...mockUser, displayName: 'Bob' };
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    mockDb.update.mockReturnValueOnce(updSetWhere());
    mockDb.query.users.findFirst.mockResolvedValueOnce(updated);

    const result = await updateUser('user-1', { displayName: 'Bob' });
    expect(result!.displayName).toBe('Bob');
  });
});

describe('updateUserPreferences', () => {
  it('returns null when user not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await updateUserPreferences('nonexistent', { theme: 'dark', homeView: 'week' });
    expect(result).toBeNull();
  });

  it('updates preferences and returns user', async () => {
    const updated = { ...mockUser, theme: 'dark' as const };
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    mockDb.update.mockReturnValueOnce(updSetWhere());
    mockDb.query.users.findFirst.mockResolvedValueOnce(updated);

    const result = await updateUserPreferences('user-1', { theme: 'dark', homeView: 'today' });
    expect(result!.theme).toBe('dark');
  });
});

describe('changePassword', () => {
  it('returns error when user not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await changePassword('nonexistent', 'old', 'new');
    expect(result).toEqual({ success: false, error: 'User not found' });
  });

  it('returns error when current password incorrect', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    mockVerifyPassword.mockResolvedValueOnce(false);
    const result = await changePassword('user-1', 'wrong', 'new');
    expect(result).toEqual({ success: false, error: 'Current password is incorrect' });
  });

  it('returns success when password changed', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    mockVerifyPassword.mockResolvedValueOnce(true);
    mockDb.update.mockReturnValueOnce(updSetWhere());

    const result = await changePassword('user-1', 'old', 'newpass');
    expect(result).toEqual({ success: true });
    expect(mockHashPassword).toHaveBeenCalledWith('newpass');
  });
});

describe('resetPassword', () => {
  it('returns error when user not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await resetPassword('nonexistent', 'newpass');
    expect(result).toEqual({ success: false, error: 'User not found' });
  });

  it('returns success when password reset', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    mockDb.update.mockReturnValueOnce(updSetWhere());

    const result = await resetPassword('user-1', 'newpass');
    expect(result).toEqual({ success: true });
    expect(mockHashPassword).toHaveBeenCalledWith('newpass');
  });
});

describe('deleteUser', () => {
  it('returns error when trying to delete self', async () => {
    const result = await deleteUser('user-1', 'user-1');
    expect(result).toEqual({ success: false, error: 'Cannot delete your own account' });
  });

  it('returns error when user not found', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await deleteUser('user-2', 'user-1');
    expect(result).toEqual({ success: false, error: 'User not found' });
  });

  it('deletes refresh tokens and user, returns success', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    mockDb.delete.mockReturnValueOnce(del()); // delete refresh tokens
    mockDb.delete.mockReturnValueOnce(del()); // delete user

    const result = await deleteUser('user-2', 'user-1');
    expect(result).toEqual({ success: true });
    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });
});
