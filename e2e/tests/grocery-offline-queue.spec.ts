import { test, expect } from '@playwright/test';
import { ALICE, BOB, ApiClient, getGroceries, groceryKey, seedWeek } from '../support/api';
import {
  banner,
  checkedRow,
  ensureServiceWorkerControl,
  newShopper,
  openGrocery,
  uncheckedRow,
  waitForPersistedList,
  waitForPersistedQueue,
  weekFromNow,
} from '../support/shopper';

const WEEK = weekFromNow(2);
const CHECKED = ['Fennel', 'Garlic', 'Leeks'];
const CUSTOM = 'Paper towels';

test.describe('offline queue survives a cold start', () => {
  test.beforeAll(async () => {
    await seedWeek(new ApiClient(ALICE), WEEK, [...CHECKED, 'Mint'], 'Offline Queue Dish');
  });

  test('changes made offline persist across a reload and drain on reconnect', async ({
    browser,
  }) => {
    const a = await newShopper(browser, ALICE);
    const b = await newShopper(browser, BOB);
    await Promise.all([openGrocery(a.page, WEEK, 'Mint'), openGrocery(b.page, WEEK, 'Mint')]);

    // Before cutting the network: the app shell must be cached by the service worker and the
    // list written to IndexedDB, otherwise the offline cold start below has nothing to restore.
    await ensureServiceWorkerControl(a.page);
    await openGrocery(a.page, WEEK, 'Mint');
    await waitForPersistedList(a.page, 'Mint');

    await a.context.setOffline(true);
    await expect(banner(a.page)).toContainText(/offline/i);

    for (const name of CHECKED) {
      await uncheckedRow(a.page, name).click();
      await expect(
        a.page.getByRole('button', {
          name: `Uncheck ${name}, checked by ${ALICE.displayName} (waiting to sync)`,
        })
      ).toBeVisible();
    }

    await a.page.getByRole('button', { name: 'Add item', exact: true }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Add custom item' });
    await dialog.getByLabel('Item name').fill(CUSTOM);
    await dialog.getByRole('button', { name: 'Add item' }).click();
    const customRow = a.page.getByRole('listitem').filter({ hasText: CUSTOM });
    await expect(customRow).toBeVisible();
    await expect(customRow.getByText('Waiting to sync')).toBeAttached();

    // Nothing reached the server or Bob while Alice was offline.
    await expect(uncheckedRow(b.page, 'Fennel')).toBeVisible();

    // Cold-start while still offline: restored from the session snapshot + IndexedDB.
    await waitForPersistedQueue(a.page, CHECKED.length + 1);
    await a.page.reload();
    await expect(a.page).not.toHaveURL(/\/login/);
    await expect(a.page.getByRole('heading', { name: 'Grocery List' })).toBeVisible();
    await expect(banner(a.page)).toContainText(/offline/i);
    for (const name of CHECKED) {
      await expect(
        a.page.getByRole('button', {
          name: `Uncheck ${name}, checked by ${ALICE.displayName} (waiting to sync)`,
        })
      ).toBeVisible();
    }
    const restoredCustom = a.page.getByRole('listitem').filter({ hasText: CUSTOM });
    await expect(restoredCustom).toBeVisible();
    await expect(restoredCustom.getByText('Waiting to sync')).toBeAttached();

    // Back online: the connectivity probe backs off (about 15s), then the queue drains.
    await a.context.setOffline(false);
    await expect(banner(a.page)).toBeEmpty({ timeout: 40_000 });
    for (const name of CHECKED) {
      await expect(checkedRow(a.page, name, ALICE.displayName)).toBeVisible();
    }
    await expect(a.page.getByText('Waiting to sync')).toHaveCount(0);

    // Bob (online all along) sees every change, pushed live.
    for (const name of CHECKED) {
      await expect(checkedRow(b.page, name, ALICE.displayName)).toBeVisible();
    }
    await expect(b.page.getByRole('listitem').filter({ hasText: CUSTOM })).toBeVisible();

    // The server agrees, asserted independently through Bob's token.
    const server = await getGroceries(new ApiClient(BOB), WEEK);
    for (const name of CHECKED) {
      const check = server.checks.find((c) => c.itemKey === groceryKey(name));
      expect(check, `${name} check`).toMatchObject({
        checked: true,
        checkedBy: { displayName: ALICE.displayName },
      });
    }
    expect(server.checks.find((c) => c.itemKey === groceryKey('Mint'))?.checked ?? false).toBe(
      false
    );
    expect(server.customItems.map((i) => i.name)).toEqual([CUSTOM]);

    await a.context.close();
    await b.context.close();
  });
});
