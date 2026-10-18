/**
 * Real migration test for dinner-9o1.2: migrates a throwaway SQLite DB to
 * 0035 (nullable dinner_entries.family_id), seeds duplicate (family, date)
 * entries, then applies 0036 (backfill + dedupe) and 0037 (NOT NULL + unique
 * index) and checks which rows survive and where their children went.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const DRIZZLE_DIR = resolve(process.cwd(), 'drizzle');
const F1 = 'fam-1';
const F2 = 'fam-2';

let tmp: string;
let sqlite: Database.Database;

function run(sql: string, ...params: unknown[]) {
  sqlite.prepare(sql).run(...params);
}

function menu(id: string, family: string, weekStart: string) {
  run(
    'INSERT INTO weekly_menus (id, family_id, week_start_date) VALUES (?, ?, ?)',
    id,
    family,
    weekStart
  );
}

function entry(id: string, menuId: string, date: string, extra: Record<string, unknown> = {}) {
  const cols: Record<string, unknown> = {
    id,
    menu_id: menuId,
    date,
    type: 'assembled',
    updated_at: '2030-01-01 00:00:00',
    ...extra,
  };
  const keys = Object.keys(cols);
  run(
    `INSERT INTO dinner_entries (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    ...Object.values(cols)
  );
}

const ids = (sql: string, ...p: unknown[]) =>
  (sqlite.prepare(sql).all(...p) as Record<string, string>[]).map((r) => Object.values(r)[0]);

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dedupe-mig-'));
  const folder = join(tmp, 'drizzle');
  cpSync(DRIZZLE_DIR, folder, { recursive: true });

  // Phase 1: journal truncated to <= 0035
  const journalPath = join(folder, 'meta', '_journal.json');
  const full = JSON.parse(readFileSync(journalPath, 'utf8'));
  const upTo35 = { ...full, entries: full.entries.filter((e: { idx: number }) => e.idx <= 35) };
  writeFileSync(journalPath, JSON.stringify(upTo35));

  sqlite = new Database(join(tmp, 'test.db'));
  sqlite.pragma('foreign_keys = OFF'); // as db/migrate.ts does
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: folder });

  // ---- Seed (state as it exists in prod before the upgrade) ----
  run("INSERT INTO families (id, name) VALUES (?, 'One'), (?, 'Two')", F1, F2);
  run(
    "INSERT INTO users (id, username, display_name, password_hash, family_id) VALUES ('u1','u1','U1','x',?)",
    F1
  );
  for (const d of ['main-x', 'side-1', 'side-2', 'main-y']) {
    run(
      "INSERT INTO dishes (id, family_id, name, type, created_by_id) VALUES (?, ?, ?, 'main', 'u1')",
      d,
      F1,
      d
    );
  }

  // Saturday-start menus (old alignment) and Sunday-start menus (current).
  menu('m-sat', F1, '2030-02-02');
  menu('m-sun', F1, '2030-02-03');
  menu('m-extra', F1, '2030-02-09'); // will only hold a removable duplicate
  menu('m-f2', F2, '2030-02-03');

  // Scenario A (2030-02-04): empty duplicate vs planned custom entry.
  entry('a-empty', 'm-sat', '2030-02-04', { updated_at: '2030-02-05 00:00:00' }); // newest but empty
  entry('a-planned', 'm-sun', '2030-02-04', { type: 'custom', custom_text: 'Pizza night' });

  // Scenario B (2030-02-05): two planned rows, both with children. B1 is
  // completed so it wins; B2's children must be moved onto B1.
  entry('b1', 'm-sat', '2030-02-05', { main_dish_id: 'main-x', completed: 1 });
  entry('b2', 'm-sun', '2030-02-05', { type: 'custom', custom_text: 'Other plan' });
  run(
    "INSERT INTO preparations (id, dish_id, dinner_entry_id, prepared_date) VALUES ('prep-b1','main-x','b1','2030-02-05')"
  );
  run(
    "INSERT INTO preparations (id, dish_id, dinner_entry_id, prepared_date) VALUES ('prep-b2',NULL,'b2','2030-02-05')"
  );
  run(
    "INSERT INTO ratings (id, preparation_id, user_id, stars) VALUES ('rate-b2','prep-b2','u1',4)"
  );
  run(
    "INSERT INTO photos (id, preparation_id, uploaded_by_id, filename, mime_type, size) VALUES ('photo-b2','prep-b2','u1','f.jpg','image/jpeg',1)"
  );
  run(
    "INSERT INTO entry_side_dishes (entry_id, dish_id) VALUES ('b1','side-1'), ('b2','side-1'), ('b2','side-2')"
  );
  run(
    "INSERT INTO prep_tasks (id, entry_id, description) VALUES ('t-b1','b1','chop'), ('t-b2a','b2','chop'), ('t-b2b','b2','marinate')"
  );

  // Scenario C: leftovers on 2030-02-06 whose source is the removed B2.
  entry('c-left', 'm-sun', '2030-02-06', { type: 'leftovers', source_entry_id: 'b2' });

  // Scenario D (2030-02-07): identical empties, tie broken by updated_at then id.
  entry('d-old', 'm-sat', '2030-02-07', { updated_at: '2030-01-01 00:00:00' });
  entry('d-new', 'm-sun', '2030-02-07', { updated_at: '2030-03-01 00:00:00' });

  // Scenario E (2030-02-09): removable duplicate that is the ONLY row of m-extra.
  entry('e-keep', 'm-sun', '2030-02-09', { type: 'dining_out', restaurant_name: 'Luigi' });
  entry('e-dup', 'm-extra', '2030-02-09');

  // Scenario F: same date in ANOTHER family must not be touched.
  entry('f2-a', 'm-f2', '2030-02-04');

  // Non-duplicates stay as they are.
  entry('solo', 'm-sun', '2030-02-08');

  // Phase 2: apply 0036 + 0037 from the real journal.
  writeFileSync(journalPath, JSON.stringify(full));
  migrate(db, { migrationsFolder: folder });
  sqlite.pragma('foreign_keys = ON');
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('0036/0037 dedupe dinner_entries', () => {
  it('leaves exactly one entry per (family, date)', () => {
    const dupes = sqlite
      .prepare(
        'SELECT family_id, date, COUNT(*) c FROM dinner_entries GROUP BY family_id, date HAVING c > 1'
      )
      .all();
    expect(dupes).toEqual([]);
  });

  it('backfills family_id from weekly_menus for every row', () => {
    const bad = sqlite
      .prepare(
        `SELECT e.id FROM dinner_entries e JOIN weekly_menus m ON m.id = e.menu_id
         WHERE e.family_id IS NULL OR e.family_id != m.family_id`
      )
      .all();
    expect(bad).toEqual([]);
  });

  it('keeps the planned row over an empty one even when the empty one is newer', () => {
    expect(
      ids("SELECT id FROM dinner_entries WHERE date = '2030-02-04' AND family_id = ?", F1)
    ).toEqual(['a-planned']);
  });

  it('keeps the completed row (B1) and moves B2 children onto it', () => {
    expect(ids("SELECT id FROM dinner_entries WHERE date = '2030-02-05'")).toEqual(['b1']);
    // preparations from both rows now hang off b1; ratings and photos follow their preparation
    expect(ids("SELECT id FROM preparations WHERE dinner_entry_id = 'b1' ORDER BY id")).toEqual([
      'prep-b1',
      'prep-b2',
    ]);
    expect(ids("SELECT id FROM ratings WHERE preparation_id = 'prep-b2'")).toEqual(['rate-b2']);
    expect(ids("SELECT id FROM photos WHERE preparation_id = 'prep-b2'")).toEqual(['photo-b2']);
    // sides are the union, no repeats
    expect(
      ids("SELECT dish_id FROM entry_side_dishes WHERE entry_id = 'b1' ORDER BY dish_id")
    ).toEqual(['side-1', 'side-2']);
    // identical task descriptions are collapsed, others moved
    expect(
      ids("SELECT description FROM prep_tasks WHERE entry_id = 'b1' ORDER BY description")
    ).toEqual(['chop', 'marinate']);
  });

  it('leaves no children pointing at removed entries', () => {
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(ids("SELECT entry_id FROM entry_side_dishes WHERE entry_id = 'b2'")).toEqual([]);
    expect(ids("SELECT id FROM prep_tasks WHERE entry_id = 'b2'")).toEqual([]);
  });

  it('re-points a leftovers source that referenced the removed duplicate', () => {
    expect(ids("SELECT source_entry_id FROM dinner_entries WHERE id = 'c-left'")).toEqual(['b1']);
  });

  it('breaks identical-precedence ties by newest updated_at', () => {
    expect(ids("SELECT id FROM dinner_entries WHERE date = '2030-02-07'")).toEqual(['d-new']);
  });

  it('removes menus left empty by the dedupe and keeps non-empty ones', () => {
    expect(ids("SELECT id FROM weekly_menus WHERE id = 'm-extra'")).toEqual([]);
    expect(ids("SELECT id FROM weekly_menus WHERE id IN ('m-sat','m-sun') ORDER BY id")).toEqual([
      'm-sat',
      'm-sun',
    ]);
    expect(ids("SELECT id FROM dinner_entries WHERE date = '2030-02-09'")).toEqual(['e-keep']);
  });

  it('does not dedupe across families and keeps non-duplicates', () => {
    expect(ids("SELECT id FROM dinner_entries WHERE id IN ('f2-a','solo') ORDER BY id")).toEqual([
      'f2-a',
      'solo',
    ]);
    expect(ids("SELECT family_id FROM dinner_entries WHERE id = 'f2-a'")).toEqual([F2]);
  });

  it('enforces uniqueness and NOT NULL afterwards', () => {
    expect(() => entry('dup-now', 'm-sun', '2030-02-08', { family_id: F1 })).toThrow(
      /UNIQUE constraint failed/
    );
    expect(() => entry('null-fam', 'm-sun', '2030-03-08', { family_id: null })).toThrow(
      /NOT NULL constraint failed/
    );
    // same date in a different family is fine
    expect(() => entry('other-fam', 'm-f2', '2030-02-08', { family_id: F2 })).not.toThrow();
  });

  it('passes integrity_check and leaves no scratch tables', () => {
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(
      ids("SELECT name FROM sqlite_master WHERE name LIKE '__new_%' OR name LIKE '_de_%'")
    ).toEqual([]);
    expect(ids("SELECT name FROM sqlite_temp_master WHERE name LIKE '_de_%'")).toEqual([]);
  });
});
