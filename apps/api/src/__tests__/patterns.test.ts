import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mockDb before vi.mock factories run
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    recurringPatterns: { findFirst: vi.fn() },
    dishes: { findFirst: vi.fn() },
    weeklyMenus: { findFirst: vi.fn() },
  },
  transaction: vi.fn(),
}));

// Mock eq so it doesn't crash on our stub schema column values
vi.mock('drizzle-orm', () => ({ eq: vi.fn().mockReturnValue(null) }));

// Mock db module — schema stubs only need to be property-accessible objects
vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    recurringPatterns: { id: null, label: null, dayOfWeek: null, type: null, mainDishId: null, customText: null, createdById: null, createdAt: null },
    patternSideDishes: { patternId: null, dishId: null },
    dishes: { id: null, name: null, type: null },
    weeklyMenus: { weekStartDate: null, id: null },
    dinnerEntries: { id: null, menuId: null, type: null, mainDishId: null, customText: null, date: null },
    entrySideDishes: { entryId: null, dishId: null },
  },
}));

import {
  listPatterns,
  createPattern,
  updatePattern,
  deletePattern,
  applyPatternsToWeek,
} from '../services/patterns.js';

// --- Chainable mock helpers ---

/** db.select().from(x) — no .where() at end (awaits .from() directly) */
function selFrom(result: unknown[]) {
  return { from: vi.fn().mockResolvedValue(result) };
}

/** db.select().from(x).where(y) — awaits .where() result */
function selWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
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

function makeTx() {
  return {
    update: vi.fn(() => makeUpdate()),
    delete: vi.fn(() => makeDelete()),
    insert: vi.fn(() => makeInsert()),
  };
}

// --- Fixtures ---

function makePattern(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pat-1',
    label: 'Test Pattern',
    dayOfWeek: 1,
    type: 'assembled' as const,
    mainDishId: null as string | null,
    customText: null as string | null,
    createdById: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    menuId: 'menu-1',
    date: '2024-01-01', // Monday (getDay() === 1)
    type: 'assembled' as const,
    mainDishId: null as string | null,
    customText: null as string | null,
    restaurantName: null,
    restaurantNotes: null,
    completed: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

/**
 * Set up mockDb calls for one getPatternWithRelations() invocation.
 * Call this for each pattern in the order getPatternWithRelations is invoked.
 */
function setupGetPatternRelations(
  pattern: ReturnType<typeof makePattern>,
  sideLinks: { dishId: string }[] = []
) {
  mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(pattern);
  if (pattern.mainDishId) {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({
      id: pattern.mainDishId,
      name: 'Main Dish',
      type: 'main',
    });
  }
  mockDb.select.mockReturnValueOnce(selWhere(sideLinks)); // side dish links
  sideLinks.forEach((link) => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({
      id: link.dishId,
      name: 'Side Dish',
      type: 'side',
    });
  });
}

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
  mockDb.transaction.mockImplementation(
    async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => fn(makeTx())
  );
});

// ===========================================================================
// listPatterns
// ===========================================================================

describe('listPatterns', () => {
  it('returns empty array when no patterns exist', async () => {
    mockDb.select.mockReturnValueOnce(selFrom([]));
    expect(await listPatterns()).toEqual([]);
  });

  it('sorts patterns by dayOfWeek ascending', async () => {
    const patFri = makePattern({ id: 'fri', dayOfWeek: 5 });
    const patMon = makePattern({ id: 'mon', dayOfWeek: 1 });

    mockDb.select.mockReturnValueOnce(selFrom([patFri, patMon]));
    setupGetPatternRelations(patFri);
    setupGetPatternRelations(patMon);

    const result = await listPatterns();
    expect(result.map((p) => p.id)).toEqual(['mon', 'fri']);
  });

  it('sorts same-day patterns by label', async () => {
    const patB = makePattern({ id: 'b', label: 'B Pattern', dayOfWeek: 1 });
    const patA = makePattern({ id: 'a', label: 'A Pattern', dayOfWeek: 1 });

    mockDb.select.mockReturnValueOnce(selFrom([patB, patA]));
    setupGetPatternRelations(patB);
    setupGetPatternRelations(patA);

    const result = await listPatterns();
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('includes main dish when mainDishId is set', async () => {
    const pat = makePattern({ mainDishId: 'dish-1' });
    mockDb.select.mockReturnValueOnce(selFrom([pat]));
    setupGetPatternRelations(pat);

    const [result] = await listPatterns();
    expect(result.mainDish).toEqual({ id: 'dish-1', name: 'Main Dish', type: 'main' });
  });

  it('includes side dishes and sideDishIds', async () => {
    const pat = makePattern();
    mockDb.select.mockReturnValueOnce(selFrom([pat]));
    setupGetPatternRelations(pat, [{ dishId: 'side-1' }]);

    const [result] = await listPatterns();
    expect(result.sideDishIds).toEqual(['side-1']);
    expect(result.sideDishes).toHaveLength(1);
    expect(result.sideDishes[0].id).toBe('side-1');
  });

  it('returns null mainDish when mainDishId is null', async () => {
    const pat = makePattern();
    mockDb.select.mockReturnValueOnce(selFrom([pat]));
    setupGetPatternRelations(pat);

    const [result] = await listPatterns();
    expect(result.mainDish).toBeNull();
    expect(result.sideDishes).toEqual([]);
  });
});

// ===========================================================================
// createPattern
// ===========================================================================

describe('createPattern', () => {
  it('inserts the pattern record', async () => {
    const input = { label: 'Pasta Night', dayOfWeek: 2, type: 'assembled' as const, sideDishIds: [] };
    setupGetPatternRelations(makePattern({ label: 'Pasta Night', dayOfWeek: 2 }));

    await createPattern(input, 'user-1');
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it('inserts side dish junction rows when sideDishIds provided', async () => {
    const input = {
      label: 'Test',
      dayOfWeek: 2,
      type: 'assembled' as const,
      sideDishIds: ['s1', 's2'],
    };
    setupGetPatternRelations(makePattern(), [{ dishId: 's1' }, { dishId: 's2' }]);

    await createPattern(input, 'user-1');
    // Called twice: once for pattern, once for sideDishes junction
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('does not insert side dishes when sideDishIds is empty', async () => {
    const input = { label: 'Test', dayOfWeek: 2, type: 'assembled' as const, sideDishIds: [] };
    setupGetPatternRelations(makePattern());

    await createPattern(input, 'user-1');
    expect(mockDb.insert).toHaveBeenCalledTimes(1); // only pattern record
  });

  it('returns the created pattern', async () => {
    const pat = makePattern({ label: 'Taco Tuesday', dayOfWeek: 2 });
    const input = { label: 'Taco Tuesday', dayOfWeek: 2, type: 'assembled' as const, sideDishIds: [] };
    setupGetPatternRelations(pat);

    const result = await createPattern(input, 'user-1');
    expect(result.label).toBe('Taco Tuesday');
    expect(result.dayOfWeek).toBe(2);
  });
});

// ===========================================================================
// updatePattern
// ===========================================================================

describe('updatePattern', () => {
  it('returns null when pattern does not exist', async () => {
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(undefined);
    expect(await updatePattern('nonexistent', { label: 'New' })).toBeNull();
  });

  it('calls db.update when label is provided', async () => {
    const existing = makePattern();
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(existing);
    setupGetPatternRelations(makePattern({ label: 'New Label' }));

    await updatePattern('pat-1', { label: 'New Label' });
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('does not call db.update when no scalar fields provided', async () => {
    const existing = makePattern();
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(existing);
    setupGetPatternRelations(existing);

    await updatePattern('pat-1', {});
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('replaces side dishes when sideDishIds is provided', async () => {
    const existing = makePattern();
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(existing);
    setupGetPatternRelations(existing, [{ dishId: 'new-s1' }]);

    await updatePattern('pat-1', { sideDishIds: ['new-s1'] });
    expect(mockDb.delete).toHaveBeenCalledOnce(); // old side dishes deleted
    expect(mockDb.insert).toHaveBeenCalledOnce(); // new ones inserted
  });

  it('does not touch side dishes when sideDishIds not in input', async () => {
    const existing = makePattern();
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(existing);
    setupGetPatternRelations(existing);

    await updatePattern('pat-1', { label: 'Updated label only' });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns updated pattern', async () => {
    const existing = makePattern();
    const updated = makePattern({ label: 'Updated' });
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(existing);
    setupGetPatternRelations(updated);

    const result = await updatePattern('pat-1', { label: 'Updated' });
    expect(result?.label).toBe('Updated');
  });
});

// ===========================================================================
// deletePattern
// ===========================================================================

describe('deletePattern', () => {
  it('returns false when pattern does not exist', async () => {
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(undefined);
    expect(await deletePattern('nonexistent')).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('deletes the pattern and returns true', async () => {
    mockDb.query.recurringPatterns.findFirst.mockResolvedValueOnce(makePattern());
    expect(await deletePattern('pat-1')).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// applyPatternsToWeek
// ===========================================================================

describe('applyPatternsToWeek', () => {
  const menu = { id: 'menu-1', weekStartDate: '2024-01-01' };

  // Monday pattern (dayOfWeek = 1, 2024-01-01 is a Monday)
  const mondayPattern = makePattern({
    id: 'mon-pat',
    dayOfWeek: 1,
    mainDishId: 'dish-1',
  });

  it('returns {applied: 0} when menu does not exist', async () => {
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(undefined);
    expect(await applyPatternsToWeek('2024-01-01')).toEqual({ applied: 0 });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('returns {applied: 0} when no entries exist', async () => {
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([]))       // entries
      .mockReturnValueOnce(selFrom([]));       // allPatterns

    expect(await applyPatternsToWeek('2024-01-01')).toEqual({ applied: 0 });
  });

  it('skips entries with mainDishId (already touched)', async () => {
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([makeEntry({ mainDishId: 'dish-1' })]))
      .mockReturnValueOnce(selFrom([mondayPattern]));

    expect(await applyPatternsToWeek('2024-01-01')).toEqual({ applied: 0 });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('skips entries with customText (already touched)', async () => {
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([makeEntry({ customText: 'Already planned' })]))
      .mockReturnValueOnce(selFrom([mondayPattern]));

    expect(await applyPatternsToWeek('2024-01-01')).toEqual({ applied: 0 });
  });

  it('skips entries with type other than assembled', async () => {
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([makeEntry({ type: 'fend_for_self' })]))
      .mockReturnValueOnce(selFrom([mondayPattern]));

    expect(await applyPatternsToWeek('2024-01-01')).toEqual({ applied: 0 });
  });

  it('skips entries with existing side dishes', async () => {
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([makeEntry()]))
      .mockReturnValueOnce(selFrom([mondayPattern]))
      .mockReturnValueOnce(selWhere([{ entryId: 'entry-1', dishId: 's1' }])); // existing side

    expect(await applyPatternsToWeek('2024-01-01')).toEqual({ applied: 0 });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('skips entry when no pattern matches its day', async () => {
    const tuesdayEntry = makeEntry({ date: '2024-01-02' }); // Tuesday = getDay() 2
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([tuesdayEntry]))
      .mockReturnValueOnce(selFrom([mondayPattern])) // only Monday pattern
      .mockReturnValueOnce(selWhere([]));             // no existing sides for entry

    expect(await applyPatternsToWeek('2024-01-01')).toEqual({ applied: 0 });
  });

  it('applies matching pattern to untouched entry and increments count', async () => {
    const entry = makeEntry(); // 2024-01-01 = Monday
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([entry]))
      .mockReturnValueOnce(selFrom([mondayPattern]))
      .mockReturnValueOnce(selWhere([]))  // no existing sides
      .mockReturnValueOnce(selWhere([])); // no pattern side links

    const result = await applyPatternsToWeek('2024-01-01');
    expect(result).toEqual({ applied: 1 });
    expect(mockDb.transaction).toHaveBeenCalledOnce();
  });

  it('maps dining_out pattern customText to restaurantName', async () => {
    const diningPattern = makePattern({
      type: 'dining_out',
      mainDishId: null,
      customText: 'Pizza Place',
    });
    const entry = makeEntry();
    let capturedSet: Record<string, unknown> = {};

    mockDb.transaction.mockImplementationOnce(
      async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
        const tx = {
          update: vi.fn(() => ({
            set: vi.fn((data: Record<string, unknown>) => {
              capturedSet = data;
              return { where: vi.fn().mockResolvedValue(undefined) };
            }),
          })),
          delete: vi.fn(() => makeDelete()),
          insert: vi.fn(() => makeInsert()),
        };
        return fn(tx);
      }
    );

    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([entry]))
      .mockReturnValueOnce(selFrom([diningPattern]))
      .mockReturnValueOnce(selWhere([]))
      .mockReturnValueOnce(selWhere([]));

    await applyPatternsToWeek('2024-01-01');
    expect(capturedSet.restaurantName).toBe('Pizza Place');
    expect(capturedSet.customText).toBeNull();
  });

  it('maps custom pattern customText to customText field', async () => {
    const customPattern = makePattern({
      type: 'custom',
      mainDishId: null,
      customText: 'Leftovers',
    });
    const entry = makeEntry();
    let capturedSet: Record<string, unknown> = {};

    mockDb.transaction.mockImplementationOnce(
      async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
        const tx = {
          update: vi.fn(() => ({
            set: vi.fn((data: Record<string, unknown>) => {
              capturedSet = data;
              return { where: vi.fn().mockResolvedValue(undefined) };
            }),
          })),
          delete: vi.fn(() => makeDelete()),
          insert: vi.fn(() => makeInsert()),
        };
        return fn(tx);
      }
    );

    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([entry]))
      .mockReturnValueOnce(selFrom([customPattern]))
      .mockReturnValueOnce(selWhere([]))
      .mockReturnValueOnce(selWhere([]));

    await applyPatternsToWeek('2024-01-01');
    expect(capturedSet.customText).toBe('Leftovers');
    expect(capturedSet.restaurantName).toBeNull();
  });

  it('uses earliest-createdAt pattern when multiple match same day', async () => {
    const older = makePattern({ id: 'older', dayOfWeek: 1, createdAt: '2024-01-01T00:00:00.000Z', mainDishId: 'old-dish' });
    const newer = makePattern({ id: 'newer', dayOfWeek: 1, createdAt: '2024-02-01T00:00:00.000Z', mainDishId: 'new-dish' });
    const entry = makeEntry();
    let capturedSet: Record<string, unknown> = {};

    mockDb.transaction.mockImplementationOnce(
      async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
        const tx = {
          update: vi.fn(() => ({
            set: vi.fn((data: Record<string, unknown>) => {
              capturedSet = data;
              return { where: vi.fn().mockResolvedValue(undefined) };
            }),
          })),
          delete: vi.fn(() => makeDelete()),
          insert: vi.fn(() => makeInsert()),
        };
        return fn(tx);
      }
    );

    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([entry]))
      .mockReturnValueOnce(selFrom([newer, older])) // newer first in array
      .mockReturnValueOnce(selWhere([]))
      .mockReturnValueOnce(selWhere([]));

    await applyPatternsToWeek('2024-01-01');
    expect(capturedSet.mainDishId).toBe('old-dish'); // older pattern wins
  });

  it('applies pattern to multiple entries and counts each', async () => {
    const entry1 = makeEntry({ id: 'e1', date: '2024-01-01' }); // Monday
    const entry2 = makeEntry({ id: 'e2', date: '2024-01-01' }); // Monday too

    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    mockDb.select
      .mockReturnValueOnce(selWhere([entry1, entry2]))
      .mockReturnValueOnce(selFrom([mondayPattern]))
      .mockReturnValueOnce(selWhere([]))  // e1 no existing sides
      .mockReturnValueOnce(selWhere([]))  // e1 pattern side links
      .mockReturnValueOnce(selWhere([]))  // e2 no existing sides
      .mockReturnValueOnce(selWhere([])); // e2 pattern side links

    const result = await applyPatternsToWeek('2024-01-01');
    expect(result).toEqual({ applied: 2 });
    expect(mockDb.transaction).toHaveBeenCalledTimes(2);
  });
});
