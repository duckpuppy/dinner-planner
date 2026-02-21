/**
 * Service unit tests for dishNotes (mocked db).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock db before importing the service
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  query: {
    dishes: { findFirst: vi.fn() },
    dishNotes: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    dishNotes: {
      id: null,
      dishId: null,
      note: null,
      createdById: null,
      createdAt: null,
    },
    dishes: { id: null },
    users: { id: null, username: null },
  },
}));

import { getDishNotes, createDishNote, deleteDishNote } from '../services/dishNotes.js';

// --- Chain helpers ---

function selFromLeftJoinWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
      }),
    }),
  };
}

function selFromLeftJoinWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

// --- Fixtures ---

function makeDishNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    dishId: 'dish-1',
    note: 'Loved it with garlic butter',
    createdById: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    createdByUsername: 'alice',
    ...overrides,
  };
}

function makeDish(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dish-1',
    name: 'Pasta',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.delete.mockReturnValue(makeDelete());
});

// ===========================================================================
// getDishNotes
// ===========================================================================

describe('getDishNotes', () => {
  it('returns empty array when no notes exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromLeftJoinWhereOrderBy([]));
    const result = await getDishNotes('dish-1');
    expect(result).toEqual([]);
  });

  it('returns notes ordered by createdAt desc', async () => {
    const note1 = makeDishNoteRow({ id: 'note-1', createdAt: '2024-01-02T00:00:00.000Z' });
    const note2 = makeDishNoteRow({ id: 'note-2', createdAt: '2024-01-01T00:00:00.000Z' });
    mockDb.select.mockReturnValueOnce(selFromLeftJoinWhereOrderBy([note1, note2]));

    const result = await getDishNotes('dish-1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('note-1');
    expect(result[1].id).toBe('note-2');
  });

  it('maps all fields including username', async () => {
    const row = makeDishNoteRow();
    mockDb.select.mockReturnValueOnce(selFromLeftJoinWhereOrderBy([row]));

    const [result] = await getDishNotes('dish-1');
    expect(result).toEqual({
      id: 'note-1',
      dishId: 'dish-1',
      note: 'Loved it with garlic butter',
      createdById: 'user-1',
      createdByUsername: 'alice',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('sets createdById and createdByUsername to null when join produces nulls', async () => {
    const row = makeDishNoteRow({ createdById: null, createdByUsername: null });
    mockDb.select.mockReturnValueOnce(selFromLeftJoinWhereOrderBy([row]));

    const [result] = await getDishNotes('dish-1');
    expect(result.createdById).toBeNull();
    expect(result.createdByUsername).toBeNull();
  });
});

// ===========================================================================
// createDishNote
// ===========================================================================

describe('createDishNote', () => {
  it('returns null when dishId does not exist', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(undefined);
    const result = await createDishNote('nonexistent', 'Great dish!', 'user-1');
    expect(result).toBeNull();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns DishNote on success', async () => {
    const row = makeDishNoteRow();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    mockDb.select.mockReturnValueOnce(selFromLeftJoinWhere([row]));

    const result = await createDishNote('dish-1', 'Loved it with garlic butter', 'user-1');
    expect(result).not.toBeNull();
    expect(result!.dishId).toBe('dish-1');
    expect(result!.note).toBe('Loved it with garlic butter');
    expect(result!.createdByUsername).toBe('alice');
  });

  it('inserts into db when dish exists', async () => {
    const row = makeDishNoteRow();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    mockDb.select.mockReturnValueOnce(selFromLeftJoinWhere([row]));

    await createDishNote('dish-1', 'Loved it with garlic butter', 'user-1');
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it('returns null when select after insert returns no rows', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    mockDb.select.mockReturnValueOnce(selFromLeftJoinWhere([]));

    const result = await createDishNote('dish-1', 'Loved it with garlic butter', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// deleteDishNote
// ===========================================================================

describe('deleteDishNote', () => {
  it('returns false when id not found', async () => {
    mockDb.query.dishNotes.findFirst.mockResolvedValueOnce(undefined);
    const result = await deleteDishNote('nonexistent');
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns true on success', async () => {
    mockDb.query.dishNotes.findFirst.mockResolvedValueOnce(makeDishNoteRow());
    const result = await deleteDishNote('note-1');
    expect(result).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});
