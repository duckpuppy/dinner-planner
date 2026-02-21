import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Service unit tests (mocked db)
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    dinnerEntries: { findFirst: vi.fn() },
    prepTasks: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    prepTasks: {
      id: null,
      entryId: null,
      description: null,
      completed: null,
      createdAt: null,
      updatedAt: null,
    },
    dinnerEntries: { id: null },
  },
}));

import {
  getPrepTasksForEntry,
  createPrepTask,
  updatePrepTask,
  deletePrepTask,
} from '../services/prepTasks.js';

// --- Chain helpers ---

function selFromWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeUpdate() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

// --- Fixtures ---

function makePrepTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    entryId: 'entry-1',
    description: 'Chop vegetables',
    completed: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    menuId: 'menu-1',
    date: '2024-01-01',
    type: 'assembled' as const,
    mainDishId: null,
    customText: null,
    completed: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
});

// ===========================================================================
// getPrepTasksForEntry
// ===========================================================================

describe('getPrepTasksForEntry', () => {
  it('returns empty array when no tasks exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([]));
    const result = await getPrepTasksForEntry('entry-1');
    expect(result).toEqual([]);
  });

  it('returns tasks ordered by createdAt asc', async () => {
    const task1 = makePrepTask({ id: 'task-1', createdAt: '2024-01-01T00:00:00.000Z' });
    const task2 = makePrepTask({ id: 'task-2', createdAt: '2024-01-02T00:00:00.000Z' });
    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([task1, task2]));

    const result = await getPrepTasksForEntry('entry-1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('task-1');
    expect(result[1].id).toBe('task-2');
  });

  it('maps all fields from row', async () => {
    const task = makePrepTask({ completed: true });
    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([task]));

    const [result] = await getPrepTasksForEntry('entry-1');
    expect(result).toEqual({
      id: 'task-1',
      entryId: 'entry-1',
      description: 'Chop vegetables',
      completed: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
  });
});

// ===========================================================================
// createPrepTask
// ===========================================================================

describe('createPrepTask', () => {
  it('returns null when entryId does not exist', async () => {
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(undefined);
    const result = await createPrepTask('nonexistent', { description: 'Test' });
    expect(result).toBeNull();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns PrepTask on success', async () => {
    const task = makePrepTask();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(makeEntry());
    mockDb.query.prepTasks.findFirst.mockResolvedValueOnce(task);

    const result = await createPrepTask('entry-1', { description: 'Chop vegetables' });
    expect(result).not.toBeNull();
    expect(result!.entryId).toBe('entry-1');
    expect(result!.description).toBe('Chop vegetables');
    expect(result!.completed).toBe(false);
  });

  it('inserts into db when entry exists', async () => {
    const task = makePrepTask();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(makeEntry());
    mockDb.query.prepTasks.findFirst.mockResolvedValueOnce(task);

    await createPrepTask('entry-1', { description: 'Chop vegetables' });
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// updatePrepTask
// ===========================================================================

describe('updatePrepTask', () => {
  it('returns null when id not found', async () => {
    mockDb.query.prepTasks.findFirst.mockResolvedValueOnce(undefined);
    const result = await updatePrepTask('nonexistent', { description: 'New desc' });
    expect(result).toBeNull();
  });

  it('returns updated task on success', async () => {
    const existing = makePrepTask();
    const updated = makePrepTask({ description: 'Updated desc', completed: true });
    mockDb.query.prepTasks.findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);

    const result = await updatePrepTask('task-1', { description: 'Updated desc', completed: true });
    expect(result).not.toBeNull();
    expect(result!.description).toBe('Updated desc');
    expect(result!.completed).toBe(true);
  });
});

// ===========================================================================
// deletePrepTask
// ===========================================================================

describe('deletePrepTask', () => {
  it('returns false when id not found', async () => {
    mockDb.query.prepTasks.findFirst.mockResolvedValueOnce(undefined);
    const result = await deletePrepTask('nonexistent');
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns true on success', async () => {
    mockDb.query.prepTasks.findFirst.mockResolvedValueOnce(makePrepTask());
    const result = await deletePrepTask('task-1');
    expect(result).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});
