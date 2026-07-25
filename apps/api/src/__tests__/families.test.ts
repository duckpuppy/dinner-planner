/**
 * Unit tests for the families service.
 * Mocks DB directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
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

import { getFamilyById, createFamily, updateFamily } from '../services/families.js';

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
