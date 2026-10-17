/**
 * dinner-9o1.1 / 9o1.2: week generation must reuse existing entries when the
 * "week starts on" setting changes, and one entry per (family, date) is
 * enforced. Uses the real per-worker SQLite database.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, schema, sqlite } from '../db/index.js';
import { getOrCreateWeekMenu, getTodayEntry } from '../services/menus.js';

const run = crypto.randomUUID().slice(0, 8);
const FAM_A = `wk-a-${run}`;
const FAM_B = `wk-b-${run}`;
const USER = `wk-user-${run}`;

// 2033-05-08 is a Sunday; 2033-05-07 a Saturday.
const WED = '2033-05-11';
const SUN_START = '2033-05-08';
const SAT_START = '2033-05-07';

function setWeekStartDay(day: number) {
  db.insert(schema.appSettings)
    .values({ id: 'default', weekStartDay: day })
    .onConflictDoUpdate({ target: schema.appSettings.id, set: { weekStartDay: day } })
    .run();
}

function entriesFor(familyId: string, dates: string[]) {
  return db
    .select()
    .from(schema.dinnerEntries)
    .where(
      and(eq(schema.dinnerEntries.familyId, familyId), inArray(schema.dinnerEntries.date, dates))
    )
    .all();
}

function menusFor(familyId: string) {
  return db
    .select()
    .from(schema.weeklyMenus)
    .where(eq(schema.weeklyMenus.familyId, familyId))
    .all();
}

function weekDates(start: string, n = 7) {
  const [y, m, d] = start.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });
}

beforeAll(() => {
  sqlite.pragma('foreign_keys = OFF');
  migrate(db, { migrationsFolder: './drizzle' });
  sqlite.pragma('foreign_keys = ON');
  db.insert(schema.families).values({ id: FAM_A, name: 'A' }).run();
  db.insert(schema.families).values({ id: FAM_B, name: 'B' }).run();
  db.insert(schema.users)
    .values({
      id: USER,
      username: USER,
      displayName: USER,
      passwordHash: 'x',
      familyId: FAM_A,
      role: 'admin',
    })
    .run();
  db.insert(schema.dishes)
    .values({ id: `dish-${run}`, familyId: FAM_A, name: 'Chili', type: 'main', createdById: USER })
    .run();
  db.insert(schema.dishes)
    .values({ id: `side-${run}`, familyId: FAM_A, name: 'Rice', type: 'side', createdById: USER })
    .run();
});

afterAll(() => {
  setWeekStartDay(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getOrCreateWeekMenu with overlapping weeks', () => {
  it('creates 7 entries carrying the family id', async () => {
    setWeekStartDay(0);
    const menu = await getOrCreateWeekMenu(WED, FAM_A);
    expect(menu.weekStartDate).toBe(SUN_START);
    expect(menu.entries.map((e) => e.date)).toEqual(weekDates(SUN_START));
    const rows = entriesFor(FAM_A, weekDates(SUN_START));
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.familyId === FAM_A)).toBe(true);
  });

  it('is idempotent: a second call neither inserts nor re-parents', async () => {
    setWeekStartDay(0);
    const first = await getOrCreateWeekMenu(WED, FAM_A);
    const second = await getOrCreateWeekMenu(WED, FAM_A);
    expect(second.id).toBe(first.id);
    expect(second.entries.map((e) => e.id)).toEqual(first.entries.map((e) => e.id));
  });

  it('re-parents overlapping entries (with children) instead of duplicating when the start day changes', async () => {
    setWeekStartDay(0);
    const sunMenu = await getOrCreateWeekMenu(WED, FAM_A);
    const wedEntry = sunMenu.entries.find((e) => e.date === WED)!;

    // Plan Wednesday richly: main dish, custom side, side dish, prep task, preparation
    db.update(schema.dinnerEntries)
      .set({ mainDishId: `dish-${run}`, customSideText: 'salad' })
      .where(eq(schema.dinnerEntries.id, wedEntry.id))
      .run();
    db.insert(schema.entrySideDishes)
      .values({ entryId: wedEntry.id, dishId: `side-${run}` })
      .run();
    db.insert(schema.prepTasks)
      .values({ id: `task-${run}`, entryId: wedEntry.id, description: 'soak beans' })
      .run();
    db.insert(schema.preparations)
      .values({
        id: `prep-${run}`,
        dishId: `dish-${run}`,
        dinnerEntryId: wedEntry.id,
        preparedDate: WED,
      })
      .run();

    // Switch to Saturday start
    setWeekStartDay(6);
    const satMenu = await getOrCreateWeekMenu(WED, FAM_A);
    expect(satMenu.weekStartDate).toBe(SAT_START);
    expect(satMenu.id).not.toBe(sunMenu.id);
    expect(satMenu.entries.map((e) => e.date)).toEqual(weekDates(SAT_START));

    // No duplicates anywhere in the union of both weeks
    const all = entriesFor(FAM_A, weekDates(SAT_START, 8));
    expect(all).toHaveLength(8);
    expect(new Set(all.map((e) => e.date)).size).toBe(8);

    // The planned entry kept its identity and children
    const moved = satMenu.entries.find((e) => e.date === WED)!;
    expect(moved.id).toBe(wedEntry.id);
    expect(moved.mainDish?.id).toBe(`dish-${run}`);
    expect(moved.customSideText).toBe('salad');
    expect(moved.sideDishes.map((s) => s.id)).toEqual([`side-${run}`]);
    expect(moved.preparations.map((p) => p.id)).toEqual([`prep-${run}`]);
    const tasks = db
      .select()
      .from(schema.prepTasks)
      .where(eq(schema.prepTasks.entryId, wedEntry.id))
      .all();
    expect(tasks.map((t) => t.id)).toEqual([`task-${run}`]);

    // The old menu keeps only the one date outside the new week (05-14)
    const oldRows = db
      .select()
      .from(schema.dinnerEntries)
      .where(eq(schema.dinnerEntries.menuId, sunMenu.id))
      .all();
    expect(oldRows.map((r) => r.date)).toEqual(['2033-05-14']);
  });

  it('deletes a menu once all of its entries have been re-parented', async () => {
    // Continues from the previous state: old Sunday menu holds only 05-14.
    setWeekStartDay(6);
    const before = menusFor(FAM_A).map((m) => m.weekStartDate);
    expect(before).toContain(SUN_START);

    // Generate the next Saturday week (05-14..20): takes 05-14 from the Sunday menu.
    const next = await getOrCreateWeekMenu('2033-05-16', FAM_A);
    expect(next.weekStartDate).toBe('2033-05-14');
    const after = menusFor(FAM_A).map((m) => m.weekStartDate);
    expect(after).not.toContain(SUN_START);
    expect(after).toContain(SAT_START);

    // Still exactly one entry per date over the whole span
    const all = entriesFor(FAM_A, weekDates(SAT_START, 14));
    expect(all).toHaveLength(14);
    expect(new Set(all.map((e) => e.date)).size).toBe(14);
  });

  it('heals a week whose entries were left in an overlapping menu', async () => {
    // Simulate the post-dedupe state: Sunday week menu exists but its Mon/Tue
    // entries live in a Saturday-aligned menu.
    const base = '2033-07-03'; // Sunday
    setWeekStartDay(0);
    const menu = await getOrCreateWeekMenu(base, FAM_A);
    const strayMenuId = `stray-${run}`;
    db.insert(schema.weeklyMenus)
      .values({ id: strayMenuId, familyId: FAM_A, weekStartDate: '2033-07-02' })
      .run();
    const mon = menu.entries.find((e) => e.date === '2033-07-04')!;
    db.update(schema.dinnerEntries)
      .set({ menuId: strayMenuId })
      .where(eq(schema.dinnerEntries.id, mon.id))
      .run();

    const healed = await getOrCreateWeekMenu(base, FAM_A);
    expect(healed.entries).toHaveLength(7);
    expect(healed.entries.find((e) => e.date === '2033-07-04')!.id).toBe(mon.id);
    expect(menusFor(FAM_A).map((m) => m.id)).not.toContain(strayMenuId);
  });

  it('never touches another family sharing the same dates', async () => {
    setWeekStartDay(0);
    const a = await getOrCreateWeekMenu('2033-09-07', FAM_A);
    const b = await getOrCreateWeekMenu('2033-09-07', FAM_B);
    expect(a.id).not.toBe(b.id);
    const ids = new Set([...a.entries, ...b.entries].map((e) => e.id));
    expect(ids.size).toBe(14);
    expect(entriesFor(FAM_B, weekDates('2033-09-04'))).toHaveLength(7);
  });
});

describe('getTodayEntry', () => {
  it('returns the planned entry that lives in an overlapping old-alignment menu', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2034, 0, 11, 12, 0, 0)); // Wed 2034-01-11

    // Old Saturday-aligned menu with a planned entry for today
    setWeekStartDay(6);
    const old = await getOrCreateWeekMenu('2034-01-11', FAM_A);
    const planned = old.entries.find((e) => e.date === '2034-01-11')!;
    db.update(schema.dinnerEntries)
      .set({ type: 'custom', customText: 'Taco night' })
      .where(eq(schema.dinnerEntries.id, planned.id))
      .run();

    // Start day changes to Sunday; today's lookup must find the planned one
    setWeekStartDay(0);
    const today = await getTodayEntry(FAM_A);
    expect(today?.id).toBe(planned.id);
    expect(today?.customText).toBe('Taco night');
    expect(entriesFor(FAM_A, ['2034-01-11'])).toHaveLength(1);
  });

  it('auto-creates today when nothing exists and is family scoped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2034, 5, 14, 12, 0, 0));
    setWeekStartDay(0);
    const a = await getTodayEntry(FAM_A);
    const b = await getTodayEntry(FAM_B);
    expect(a?.date).toBe('2034-06-14');
    expect(b?.date).toBe('2034-06-14');
    expect(a?.id).not.toBe(b?.id);
  });
});

describe('dinner_entries (family_id, date) uniqueness', () => {
  it('rejects a second entry for the same family and date', async () => {
    setWeekStartDay(0);
    const menu = await getOrCreateWeekMenu('2033-11-09', FAM_A);
    const existing = menu.entries[2];
    expect(() =>
      db
        .insert(schema.dinnerEntries)
        .values({
          id: `dup-${run}`,
          menuId: menu.id,
          familyId: FAM_A,
          date: existing.date,
        })
        .run()
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('allows the same date in a different family', async () => {
    const menuB = await getOrCreateWeekMenu('2033-11-09', FAM_B);
    expect(menuB.entries).toHaveLength(7);
  });
});
