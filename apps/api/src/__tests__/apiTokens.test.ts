import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ run: vi.fn() }) }),
  select: vi.fn(),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: vi.fn() }) }),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 1 }) }),
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue('eq-clause'),
  and: vi.fn().mockReturnValue('and-clause'),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    apiTokens: {
      id: 'id',
      userId: 'userId',
      name: 'name',
      tokenHash: 'tokenHash',
      expiresAt: 'expiresAt',
      lastUsedAt: 'lastUsedAt',
      createdAt: 'createdAt',
    },
    users: { id: 'id', username: 'username', role: 'role' },
  },
}));

import {
  generateApiToken,
  validateApiToken,
  revokeApiToken,
  listApiTokens,
} from '../services/apiTokens.js';

describe('generateApiToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a dp_-prefixed token', () => {
    const { token } = generateApiToken('user-1', 'My Token');
    expect(token).toMatch(/^dp_[0-9a-f]{64}$/);
  });

  it('returns a uuid id', () => {
    const { id } = generateApiToken('user-1', 'My Token');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stores a hash, not the raw token', () => {
    const insertValues = vi.fn().mockReturnValue({ run: vi.fn() });
    mockDb.insert.mockReturnValue({ values: insertValues });

    const { token } = generateApiToken('user-1', 'My Token');

    const stored = insertValues.mock.calls[0][0];
    expect(stored.tokenHash).toBeDefined();
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toHaveLength(64); // SHA-256 hex
  });

  it('passes expiresAt when provided', () => {
    const insertValues = vi.fn().mockReturnValue({ run: vi.fn() });
    mockDb.insert.mockReturnValue({ values: insertValues });

    generateApiToken('user-1', 'My Token', '2026-12-31T00:00:00.000Z');

    const stored = insertValues.mock.calls[0][0];
    expect(stored.expiresAt).toBe('2026-12-31T00:00:00.000Z');
  });

  it('sets expiresAt to null when not provided', () => {
    const insertValues = vi.fn().mockReturnValue({ run: vi.fn() });
    mockDb.insert.mockReturnValue({ values: insertValues });

    generateApiToken('user-1', 'My Token');

    const stored = insertValues.mock.calls[0][0];
    expect(stored.expiresAt).toBeNull();
  });
});

describe('validateApiToken', () => {
  beforeEach(() => vi.clearAllMocks());

  function setupSelectChain(returnValue: unknown) {
    const get = vi.fn().mockReturnValue(returnValue);
    const where = vi.fn().mockReturnValue({ get });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    mockDb.select.mockReturnValue({ from });
    return { get, where, innerJoin, from };
  }

  it('returns null for unknown token', () => {
    setupSelectChain(null);
    expect(validateApiToken('dp_unknown')).toBeNull();
  });

  it('returns user info for valid token', () => {
    setupSelectChain({
      tokenId: 'tok-1',
      expiresAt: null,
      userId: 'user-1',
      username: 'alice',
      role: 'admin',
    });
    const result = validateApiToken('dp_validtoken');
    expect(result).toMatchObject({ userId: 'user-1', username: 'alice', role: 'admin' });
  });

  it('returns null for expired token', () => {
    setupSelectChain({
      tokenId: 'tok-1',
      expiresAt: '2020-01-01T00:00:00.000Z', // past
      userId: 'user-1',
      username: 'alice',
      role: 'admin',
    });
    expect(validateApiToken('dp_expiredtoken')).toBeNull();
  });

  it('returns user for non-expired token', () => {
    setupSelectChain({
      tokenId: 'tok-1',
      expiresAt: '2099-01-01T00:00:00.000Z', // future
      userId: 'user-1',
      username: 'alice',
      role: 'member',
    });
    expect(validateApiToken('dp_future')).toMatchObject({ userId: 'user-1' });
  });

  it('updates lastUsedAt on valid hit', () => {
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: vi.fn() }) });
    mockDb.update.mockReturnValue({ set: updateSet });

    setupSelectChain({
      tokenId: 'tok-1',
      expiresAt: null,
      userId: 'user-1',
      username: 'alice',
      role: 'admin',
    });

    validateApiToken('dp_valid');
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastUsedAt: expect.any(String) })
    );
  });
});

describe('revokeApiToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when token is deleted', () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 1 }) }),
    });
    expect(revokeApiToken('tok-1', 'user-1')).toBe(true);
  });

  it('returns false when token not found or wrong owner', () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 0 }) }),
    });
    expect(revokeApiToken('tok-1', 'wrong-user')).toBe(false);
  });
});

describe('listApiTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no tokens', () => {
    const all = vi.fn().mockReturnValue([]);
    const where = vi.fn().mockReturnValue({ all });
    const from = vi.fn().mockReturnValue({ where });
    mockDb.select.mockReturnValue({ from });
    expect(listApiTokens('user-1')).toEqual([]);
  });

  it('returns token rows without hash', () => {
    const rows = [
      { id: 'tok-1', name: 'HA', lastUsedAt: null, expiresAt: null, createdAt: '2026-01-01' },
    ];
    const all = vi.fn().mockReturnValue(rows);
    const where = vi.fn().mockReturnValue({ all });
    const from = vi.fn().mockReturnValue({ where });
    mockDb.select.mockReturnValue({ from });
    const result = listApiTokens('user-1');
    expect(result).toEqual(rows);
    expect(result[0]).not.toHaveProperty('tokenHash');
  });
});
