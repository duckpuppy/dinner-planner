/**
 * Unit tests for the families service.
 * Mocks DB directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
  query: {
    families: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn().mockReturnValue(null) }));
vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    families: { id: null },
    users: { id: null },
  },
}));

import {
  getFamilyById,
  createFamily,
  updateFamily,
  isSoleAdminOrphaningFamily,
} from '../services/families.js';

function makeUser(overrides: Partial<{ id: string; role: 'admin' | 'member' }> = {}) {
  return {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    passwordHash: 'hash',
    role: 'member' as const,
    familyId: 'family-1',
    theme: 'light' as const,
    homeView: 'today' as const,
    dietaryPreferences: '[]',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

function mockSelectFrom(users: ReturnType<typeof makeUser>[]) {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(users),
    }),
  });
}

function ins() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function updSetWhere() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

const mockFamily = {
  id: 'family-1',
  name: 'The Smiths',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFamilyById', () => {
  it('returns family response when found', async () => {
    mockDb.query.families.findFirst.mockResolvedValueOnce(mockFamily);
    const result = await getFamilyById('family-1');
    expect(result).toEqual(mockFamily);
  });

  it('returns null when not found', async () => {
    mockDb.query.families.findFirst.mockResolvedValueOnce(null);
    const result = await getFamilyById('nonexistent');
    expect(result).toBeNull();
  });
});

describe('createFamily', () => {
  it('creates a family and reassigns the creator into it as admin', async () => {
    mockDb.insert.mockReturnValueOnce(ins()); // insert family
    mockDb.update.mockReturnValueOnce(updSetWhere()); // reassign creator
    mockDb.query.families.findFirst.mockResolvedValueOnce(mockFamily); // post-insert fetch

    const result = await createFamily({ name: 'The Smiths' }, 'user-1');

    expect(result.name).toBe('The Smiths');
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

describe('updateFamily', () => {
  it('returns null when family not found', async () => {
    mockDb.query.families.findFirst.mockResolvedValueOnce(null);
    const result = await updateFamily('nonexistent', { name: 'New Name' });
    expect(result).toBeNull();
  });

  it('renames and returns the family', async () => {
    const renamed = { ...mockFamily, name: 'New Name' };
    mockDb.query.families.findFirst.mockResolvedValueOnce(mockFamily);
    mockDb.update.mockReturnValueOnce(updSetWhere());
    mockDb.query.families.findFirst.mockResolvedValueOnce(renamed);

    const result = await updateFamily('family-1', { name: 'New Name' });
    expect(result!.name).toBe('New Name');
  });
});

describe('isSoleAdminOrphaningFamily', () => {
  it('returns false when the sole admin is the only member of the family', async () => {
    mockSelectFrom([makeUser({ id: 'user-1', role: 'admin' })]);

    const result = await isSoleAdminOrphaningFamily('family-1', 'user-1');
    expect(result).toBe(false);
  });

  it('returns true when the caller is the sole admin and other members exist', async () => {
    mockSelectFrom([
      makeUser({ id: 'user-1', role: 'admin' }),
      makeUser({ id: 'user-2', role: 'member' }),
    ]);

    const result = await isSoleAdminOrphaningFamily('family-1', 'user-1');
    expect(result).toBe(true);
  });

  it('returns false when there are multiple admins and other members', async () => {
    mockSelectFrom([
      makeUser({ id: 'user-1', role: 'admin' }),
      makeUser({ id: 'user-2', role: 'admin' }),
      makeUser({ id: 'user-3', role: 'member' }),
    ]);

    const result = await isSoleAdminOrphaningFamily('family-1', 'user-1');
    expect(result).toBe(false);
  });

  it('returns false when the caller is not an admin', async () => {
    mockSelectFrom([
      makeUser({ id: 'user-1', role: 'admin' }),
      makeUser({ id: 'user-2', role: 'member' }),
    ]);

    const result = await isSoleAdminOrphaningFamily('family-1', 'user-2');
    expect(result).toBe(false);
  });
});
