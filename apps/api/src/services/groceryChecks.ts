import { eq, and, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/**
 * Grocery check state is per-item last-write-wins (dinner-4kj.3).
 *
 * Each (family, week, itemKey) row carries `checked` and `updatedAtMs`. A row
 * with checked=0 is a tombstone: it is kept so that a late, older write (for
 * example an offline queue replaying) cannot resurrect a cleared item.
 */

export interface CheckState {
  itemKey: string;
  checked: boolean;
  updatedAt: number;
  checkedBy: { id: string; displayName: string } | null;
}

export interface SetCheckResult {
  check: CheckState;
  /** True when this write won and changed the stored state. */
  changed: boolean;
}

const scope = (weekDate: string, familyId: string) =>
  and(eq(schema.groceryChecks.weekDate, weekDate), eq(schema.groceryChecks.familyId, familyId));

/** Clamp a client timestamp so a skewed clock cannot win forever. */
export function clampClientTime(clientUpdatedAt: number, now: number = Date.now()): number {
  return Math.min(Math.floor(clientUpdatedAt), now);
}

const checkColumns = {
  itemKey: schema.groceryChecks.itemKey,
  checked: schema.groceryChecks.checked,
  updatedAtMs: schema.groceryChecks.updatedAtMs,
  userId: schema.users.id,
  displayName: schema.users.displayName,
};

type CheckRow = {
  itemKey: string;
  checked: boolean;
  updatedAtMs: number;
  userId: string | null;
  displayName: string | null;
};

function toCheckState(r: CheckRow): CheckState {
  return {
    itemKey: r.itemKey,
    checked: r.checked,
    updatedAt: r.updatedAtMs,
    checkedBy: r.userId && r.displayName ? { id: r.userId, displayName: r.displayName } : null,
  };
}

/**
 * Get all check states (including tombstones) for a week and family.
 */
export async function getChecks(weekDate: string, familyId: string): Promise<CheckState[]> {
  const rows = await db
    .select(checkColumns)
    .from(schema.groceryChecks)
    .leftJoin(schema.users, eq(schema.users.id, schema.groceryChecks.checkedByUserId))
    .where(scope(weekDate, familyId));
  return rows.map(toCheckState);
}

/**
 * Get all checked item keys for a given week and family.
 * Tombstones (checked=0) are excluded.
 */
export async function getCheckedKeys(weekDate: string, familyId: string): Promise<string[]> {
  const rows = await db
    .select({ itemKey: schema.groceryChecks.itemKey })
    .from(schema.groceryChecks)
    .where(and(scope(weekDate, familyId), eq(schema.groceryChecks.checked, true)));

  return rows.map((r) => r.itemKey);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Upsert applying last-write-wins; `t` must already be clamped. Sync (better-sqlite3). */
function applySet(
  tx: Tx,
  args: {
    weekDate: string;
    itemKey: string;
    itemName: string;
    checked: boolean;
    t: number;
    userId: string;
    familyId: string;
  }
): SetCheckResult {
  const { weekDate, itemKey, itemName, checked, t, userId, familyId } = args;
  const res = tx
    .insert(schema.groceryChecks)
    .values({
      familyId,
      weekDate,
      itemKey,
      itemName,
      checkedByUserId: userId,
      checked,
      updatedAtMs: t,
    })
    .onConflictDoUpdate({
      target: [
        schema.groceryChecks.familyId,
        schema.groceryChecks.weekDate,
        schema.groceryChecks.itemKey,
      ],
      set: {
        itemName,
        checkedByUserId: userId,
        checked,
        updatedAtMs: t,
      },
      setWhere: sql`excluded.updated_at_ms > ${schema.groceryChecks.updatedAtMs}`,
    })
    .run();

  const row = tx
    .select(checkColumns)
    .from(schema.groceryChecks)
    .leftJoin(schema.users, eq(schema.users.id, schema.groceryChecks.checkedByUserId))
    .where(and(scope(weekDate, familyId), eq(schema.groceryChecks.itemKey, itemKey)))
    .get();

  return { check: toCheckState(row as CheckRow), changed: res.changes > 0 };
}

/**
 * Set a check's state with last-write-wins semantics. The write only takes
 * effect if the (clamped) client timestamp is strictly newer than the stored one.
 */
export async function setCheck(args: {
  weekDate: string;
  itemKey: string;
  itemName: string;
  checked: boolean;
  clientUpdatedAt: number;
  userId: string;
  familyId: string;
}): Promise<SetCheckResult> {
  const t = clampClientTime(args.clientUpdatedAt);
  return db.transaction((tx) => applySet(tx, { ...args, t }));
}

/**
 * Legacy toggle: one transaction that reads the current state and applies
 * set(!current, now). Returns the new checked state.
 */
export async function toggleCheck(
  weekDate: string,
  itemKey: string,
  itemName: string,
  userId: string,
  familyId: string
): Promise<boolean> {
  return db.transaction((tx) => {
    const current = tx
      .select({
        checked: schema.groceryChecks.checked,
        updatedAtMs: schema.groceryChecks.updatedAtMs,
      })
      .from(schema.groceryChecks)
      .where(and(scope(weekDate, familyId), eq(schema.groceryChecks.itemKey, itemKey)))
      .get();
    const checked = !(current?.checked ?? false);
    // Ensure strictly newer than the stored state even within the same millisecond.
    const t = Math.max(Date.now(), (current?.updatedAtMs ?? 0) + 1);
    applySet(tx, { weekDate, itemKey, itemName, checked, t, userId, familyId });
    return checked;
  });
}

/**
 * Clear checks for a week as of time `t` (clamped). Rows last written at or after
 * `t` (e.g. a check by another shopper after the clear) survive. Rows become
 * tombstones rather than being deleted. Returns the number of rows affected.
 */
export async function clearChecks(
  weekDate: string,
  clientUpdatedAt: number,
  familyId: string
): Promise<number> {
  const t = clampClientTime(clientUpdatedAt);
  const res = db
    .update(schema.groceryChecks)
    .set({ checked: false, updatedAtMs: t })
    .where(and(scope(weekDate, familyId), lt(schema.groceryChecks.updatedAtMs, t)))
    .run();
  return res.changes;
}

/**
 * Legacy clear-all: a clear at Date.now().
 */
export async function clearAllChecks(weekDate: string, familyId: string): Promise<void> {
  await clearChecks(weekDate, Date.now(), familyId);
}
