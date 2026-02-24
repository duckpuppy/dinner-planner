/**
 * Unit tests for the setup service.
 * Mocks DB directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pw'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn(),
  eq: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    users: { id: null, username: null },
    appSettings: { id: null },
  },
}));

import { isSetupRequired, createFirstAdmin } from '../services/setup.js';

// Helper: db.select().from() resolving to [{count}]
function selFromWithCount(count: number) {
  return {
    from: vi.fn().mockResolvedValue([{ count }]),
  };
}

// Helper: db.select().from().limit() chain
function selFromLimit(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(result) }),
  };
}

// Helper: db.insert().values()
function insValues() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isSetupRequired', () => {
  it('returns true when no users exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromWithCount(0));
    const result = await isSetupRequired();
    expect(result).toBe(true);
  });

  it('returns false when users exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromWithCount(1));
    const result = await isSetupRequired();
    expect(result).toBe(false);
  });
});

describe('createFirstAdmin', () => {
  it('returns { success: false } when users already exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromWithCount(1));
    const result = await createFirstAdmin('admin', 'password123');
    expect(result).toEqual({ success: false });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('inserts user and appSettings when no users exist, returns { success: true }', async () => {
    // isSetupRequired check — no users
    mockDb.select.mockReturnValueOnce(selFromWithCount(0));
    // insert user
    mockDb.insert.mockReturnValueOnce(insValues());
    // check existing appSettings — none found
    mockDb.select.mockReturnValueOnce(selFromLimit([]));
    // insert appSettings
    mockDb.insert.mockReturnValueOnce(insValues());

    const result = await createFirstAdmin('alice', 'securepass');
    expect(result).toEqual({ success: true });
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('does not insert appSettings when they already exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromWithCount(0));
    mockDb.insert.mockReturnValueOnce(insValues());
    // appSettings already exist
    mockDb.select.mockReturnValueOnce(selFromLimit([{ id: 'default', weekStartDay: 0 }]));

    const result = await createFirstAdmin('alice', 'securepass');
    expect(result).toEqual({ success: true });
    // Only user insert — no appSettings insert
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });
});
