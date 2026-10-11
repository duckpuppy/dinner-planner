import { test, expect } from '@playwright/test';
import {
  ALICE,
  BOB,
  ApiClient,
  getGroceries,
  groceryKey,
  seedWeek,
  type GroceryResponse,
} from '../support/api';
import {
  banner,
  checkedRow,
  newShopper,
  openGrocery,
  uncheckedRow,
  weekFromNow,
} from '../support/shopper';

/** Put an item in the checked state on the server, stamped well in the past. */
async function seedChecked(api: ApiClient, week: string, name: string): Promise<void> {
  const { weekStartDate } = await getGroceries(api, week);
  await api.put('/api/grocery/checks', {
    weekDate: weekStartDate,
    itemKey: groceryKey(name),
    itemName: name,
    checked: true,
    clientUpdatedAt: Date.now() - 60_000,
  });
}

const isChecked = (g: GroceryResponse, name: string) =>
  g.checks.find((c) => c.itemKey === groceryKey(name))?.checked ?? false;

test.describe('last write wins across offline shoppers', () => {
  test('a later uncheck beats an earlier check even when it arrives first', async ({ browser }) => {
    const week = weekFromNow(3);
    const alice = new ApiClient(ALICE);
    const bob = new ApiClient(BOB);
    await seedWeek(alice, week, ['Eggplant', 'Figs'], 'Conflict Dish');
    await seedChecked(alice, week, 'Eggplant');

    const a = await newShopper(browser, ALICE);
    const b = await newShopper(browser, BOB);
    await Promise.all([openGrocery(a.page, week, 'Figs'), openGrocery(b.page, week, 'Figs')]);
    await expect(checkedRow(a.page, 'Eggplant', ALICE.displayName)).toBeVisible();
    await expect(checkedRow(b.page, 'Eggplant', ALICE.displayName)).toBeVisible();

    await Promise.all([a.context.setOffline(true), b.context.setOffline(true)]);
    await expect(banner(a.page)).toContainText(/offline/i);
    await expect(banner(b.page)).toContainText(/offline/i);

    // Alice's final action is a check (she toggles it off and on). Bob acts afterwards, so his
    // uncheck carries the later client timestamp.
    await checkedRow(a.page, 'Eggplant').click();
    await expect(uncheckedRow(a.page, 'Eggplant')).toBeVisible();
    await uncheckedRow(a.page, 'Eggplant').click();
    await expect(checkedRow(a.page, 'Eggplant', ALICE.displayName)).toBeVisible();

    await checkedRow(b.page, 'Eggplant').click();
    await expect(uncheckedRow(b.page, 'Eggplant')).toBeVisible();

    // Nothing has reached the server yet.
    expect(isChecked(await getGroceries(bob, week), 'Eggplant')).toBe(true);

    // Bob (the later write) reaches the server first; Alice's older check then arrives and
    // must lose rather than clobber it.
    await b.context.setOffline(false);
    await expect(banner(b.page)).toBeEmpty({ timeout: 40_000 });
    await expect.poll(async () => isChecked(await getGroceries(bob, week), 'Eggplant')).toBe(false);

    await a.context.setOffline(false);
    await expect(banner(a.page)).toBeEmpty({ timeout: 40_000 });

    await expect(uncheckedRow(a.page, 'Eggplant')).toBeVisible();
    await expect(uncheckedRow(b.page, 'Eggplant')).toBeVisible();
    // Stays converged: Alice's drained write did not flip it back.
    const final = await getGroceries(bob, week);
    expect(isChecked(final, 'Eggplant')).toBe(false);
    await expect(uncheckedRow(a.page, 'Eggplant')).toBeVisible();

    await a.context.close();
    await b.context.close();
  });

  test('a clear-all does not wipe an item checked after it', async ({ browser }) => {
    const week = weekFromNow(4);
    const alice = new ApiClient(ALICE);
    const bob = new ApiClient(BOB);
    await seedWeek(alice, week, ['Yams', 'Zucchini'], 'Clear Dish');
    await seedChecked(alice, week, 'Zucchini');

    const a = await newShopper(browser, ALICE);
    const b = await newShopper(browser, BOB);
    await Promise.all([openGrocery(a.page, week, 'Yams'), openGrocery(b.page, week, 'Yams')]);
    await expect(checkedRow(a.page, 'Zucchini')).toBeVisible();

    // Alice clears the list while offline, so the clear is stamped before what Bob does next.
    await a.context.setOffline(true);
    await expect(banner(a.page)).toContainText(/offline/i);
    // The offline banner is in flow, so neither list action is covered by it.
    await a.page.getByRole('button', { name: 'Copy' }).click({ trial: true });
    await a.page.getByRole('button', { name: 'Clear' }).click();
    await expect(uncheckedRow(a.page, 'Zucchini')).toBeVisible();

    await uncheckedRow(b.page, 'Yams').click();
    await expect(checkedRow(b.page, 'Yams', BOB.displayName)).toBeVisible();
    await expect.poll(async () => isChecked(await getGroceries(bob, week), 'Yams')).toBe(true);

    // Alice's older clear now reaches the server: Zucchini clears, Yams survives.
    await a.context.setOffline(false);
    await expect(banner(a.page)).toBeEmpty({ timeout: 40_000 });

    await expect(checkedRow(a.page, 'Yams', BOB.displayName)).toBeVisible();
    await expect(checkedRow(b.page, 'Yams', BOB.displayName)).toBeVisible();
    await expect(uncheckedRow(a.page, 'Zucchini')).toBeVisible();
    await expect(uncheckedRow(b.page, 'Zucchini')).toBeVisible();

    const final = await getGroceries(bob, week);
    expect(isChecked(final, 'Yams')).toBe(true);
    expect(isChecked(final, 'Zucchini')).toBe(false);

    await a.context.close();
    await b.context.close();
  });
});
