/**
 * Service tests for groceryChecks against a real in-memory SQLite database
 * (all migrations applied), so the last-write-wins SQL is actually exercised.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../db/schema.js';

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../db/index.js', async () => {
  const actualSchema = await import('../db/schema.js');
  return {
    schema: actualSchema,
    get db() {
      return holder.db;
    },
  };
});

import {
  getChecks,
  getCheckedKeys,
  setCheck,
  toggleCheck,
  clearChecks,
  clearAllChecks,
} from '../services/groceryChecks.js';

const WEEK = '2026-02-24';
const NOW = 1_800_000_000_000;

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: './drizzle' });
  sqlite.pragma('foreign_keys = ON');
  holder.db = testDb;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sqlite.exec('DELETE FROM grocery_checks; DELETE FROM users; DELETE FROM families;');
  for (const f of ['fam-a', 'fam-b']) {
    testDb.insert(schema.families).values({ id: f, name: f }).run();
  }
  const mk = (id: string, name: string, familyId: string) =>
    testDb
      .insert(schema.users)
      .values({ id, username: id, displayName: name, passwordHash: 'x', familyId })
      .run();
  mk('u1', 'Alice', 'fam-a');
  mk('u2', 'Bob', 'fam-a');
  mk('u3', 'Carol', 'fam-b');
});

afterEach(() => {
  vi.useRealTimers();
});

const put = (over: Partial<Parameters<typeof setCheck>[0]> = {}): ReturnType<typeof setCheck> =>
  setCheck({
    weekDate: WEEK,
    itemKey: 'flour::cup',
    itemName: 'Flour',
    checked: true,
    clientUpdatedAt: NOW - 1000,
    userId: 'u1',
    familyId: 'fam-a',
    ...over,
  });

describe('setCheck (last-write-wins)', () => {
  it('inserts a new check and returns the winning row', async () => {
    const r = await put();
    expect(r.changed).toBe(true);
    expect(r.check).toEqual({
      itemKey: 'flour::cup',
      checked: true,
      updatedAt: NOW - 1000,
      checkedBy: { id: 'u1', displayName: 'Alice' },
    });
  });

  it('ignores an older timestamp and returns the existing winner', async () => {
    await put({ checked: true, clientUpdatedAt: NOW - 1000, userId: 'u1' });
    const r = await put({ checked: false, clientUpdatedAt: NOW - 5000, userId: 'u2' });
    expect(r.changed).toBe(false);
    expect(r.check.checked).toBe(true);
    expect(r.check.updatedAt).toBe(NOW - 1000);
    expect(r.check.checkedBy?.id).toBe('u1');
  });

  it('ignores an equal timestamp (strictly newer wins)', async () => {
    await put({ clientUpdatedAt: NOW - 1000 });
    const r = await put({ checked: false, clientUpdatedAt: NOW - 1000, userId: 'u2' });
    expect(r.changed).toBe(false);
    expect(r.check.checked).toBe(true);
  });

  it('a newer write wins and records the caller', async () => {
    await put({ clientUpdatedAt: NOW - 5000 });
    const r = await put({ checked: false, clientUpdatedAt: NOW - 1000, userId: 'u2' });
    expect(r.changed).toBe(true);
    expect(r.check).toMatchObject({ checked: false, checkedBy: { id: 'u2', displayName: 'Bob' } });
  });

  it('is idempotent when replayed', async () => {
    await put();
    const r = await put();
    expect(r.changed).toBe(false);
    expect((await getChecks(WEEK, 'fam-a')).length).toBe(1);
  });

  it('clamps a future timestamp to server time', async () => {
    const r = await put({ clientUpdatedAt: NOW + 10 * 60 * 60 * 1000 });
    expect(r.check.updatedAt).toBe(NOW);
    // a later honest write (after the server clock advances) still beats it
    vi.setSystemTime(NOW + 1000);
    const r2 = await put({ checked: false, clientUpdatedAt: NOW + 500, userId: 'u2' });
    expect(r2.changed).toBe(true);
    expect(r2.check.checked).toBe(false);
  });

  it('a legacy row (updated_at_ms=0) is superseded by any client write', async () => {
    sqlite
      .prepare(
        `INSERT INTO grocery_checks (family_id, week_date, item_key, item_name, checked_by_user_id)
         VALUES ('fam-a', ?, 'legacy', 'Legacy', 'u1')`
      )
      .run(WEEK);
    const before = await getChecks(WEEK, 'fam-a');
    expect(before[0]).toMatchObject({ checked: true, updatedAt: 0 });
    const r = await put({ itemKey: 'legacy', checked: false, clientUpdatedAt: 1 });
    expect(r.changed).toBe(true);
    expect(r.check.checked).toBe(false);
  });
});

describe('clearChecks', () => {
  it('a check made after the clear survives', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000 });
    await put({ itemKey: 'b', clientUpdatedAt: NOW - 1000 });
    const cleared = await clearChecks(WEEK, NOW - 2000, 'fam-a');
    expect(cleared).toBe(1);
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual(['b']);
  });

  it('a check then a later clear clears it', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000 });
    const cleared = await clearChecks(WEEK, NOW - 1000, 'fam-a');
    expect(cleared).toBe(1);
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual([]);
  });

  it('a clear, then a replayed older check does not resurrect the item', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000 });
    await clearChecks(WEEK, NOW - 1000, 'fam-a');
    const r = await put({ itemKey: 'a', clientUpdatedAt: NOW - 2000 });
    expect(r.changed).toBe(false);
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual([]);
  });

  it('clamps a future clear timestamp', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000 });
    await clearChecks(WEEK, NOW + 99_999_999, 'fam-a');
    const [c] = await getChecks(WEEK, 'fam-a');
    expect(c.updatedAt).toBe(NOW);
  });

  it('only affects the given week', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000 });
    await put({ itemKey: 'a', weekDate: '2026-03-03', clientUpdatedAt: NOW - 3000 });
    await clearChecks(WEEK, NOW - 1000, 'fam-a');
    expect(await getCheckedKeys('2026-03-03', 'fam-a')).toEqual(['a']);
  });
});

describe('legacy shims', () => {
  it('toggleCheck checks, then unchecks leaving a tombstone', async () => {
    expect(await toggleCheck(WEEK, 'k', 'K', 'u1', 'fam-a')).toBe(true);
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual(['k']);
    expect(await toggleCheck(WEEK, 'k', 'K', 'u2', 'fam-a')).toBe(false);
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual([]);
    const checks = await getChecks(WEEK, 'fam-a');
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ checked: false, checkedBy: { id: 'u2' } });
    // toggles within the same millisecond still flip
    expect(await toggleCheck(WEEK, 'k', 'K', 'u1', 'fam-a')).toBe(true);
  });

  it('clearAllChecks turns rows into tombstones instead of deleting', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000 });
    await put({ itemKey: 'b', clientUpdatedAt: NOW - 2000 });
    vi.setSystemTime(NOW + 10);
    await clearAllChecks(WEEK, 'fam-a');
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual([]);
    const checks = await getChecks(WEEK, 'fam-a');
    expect(checks).toHaveLength(2);
    expect(checks.every((c) => !c.checked && c.updatedAt === NOW + 10)).toBe(true);
  });
});

describe('reads and family isolation', () => {
  it('getChecks returns checkedBy and getCheckedKeys excludes tombstones', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000, userId: 'u1' });
    await put({ itemKey: 'b', clientUpdatedAt: NOW - 3000, userId: 'u2' });
    await put({ itemKey: 'b', checked: false, clientUpdatedAt: NOW - 1000, userId: 'u2' });
    const checks = await getChecks(WEEK, 'fam-a');
    expect(checks).toHaveLength(2);
    expect(checks.find((c) => c.itemKey === 'a')).toEqual({
      itemKey: 'a',
      checked: true,
      updatedAt: NOW - 3000,
      checkedBy: { id: 'u1', displayName: 'Alice' },
    });
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual(['a']);
  });

  it('families are isolated for writes, reads and clears', async () => {
    await put({ itemKey: 'a', clientUpdatedAt: NOW - 3000, userId: 'u1', familyId: 'fam-a' });
    // same item key in another family is an independent row, even with an older timestamp
    const r = await put({
      itemKey: 'a',
      clientUpdatedAt: NOW - 9000,
      userId: 'u3',
      familyId: 'fam-b',
    });
    expect(r.changed).toBe(true);
    expect(await getCheckedKeys(WEEK, 'fam-b')).toEqual(['a']);

    await clearChecks(WEEK, NOW - 1000, 'fam-b');
    expect(await getCheckedKeys(WEEK, 'fam-b')).toEqual([]);
    expect(await getCheckedKeys(WEEK, 'fam-a')).toEqual(['a']);
    expect((await getChecks(WEEK, 'fam-a'))[0].checkedBy?.id).toBe('u1');
  });
});
