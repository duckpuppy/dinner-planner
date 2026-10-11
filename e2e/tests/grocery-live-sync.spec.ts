import { test, expect } from '@playwright/test';
import { ALICE, BOB, ApiClient, getGroceries, groceryKey, seedWeek } from '../support/api';
import { checkedRow, newShopper, openGrocery, uncheckedRow, weekFromNow } from '../support/shopper';

const WEEK = weekFromNow(1);

test.describe('live sync between two shoppers', () => {
  test.beforeAll(async () => {
    await seedWeek(new ApiClient(ALICE), WEEK, ['Basil', 'Carrots', 'Dill'], 'Live Sync Dish');
  });

  test('a check by one shopper shows on the other within 1.5s, with who checked it', async ({
    browser,
  }) => {
    const a = await newShopper(browser, ALICE);
    const b = await newShopper(browser, BOB);
    await Promise.all([openGrocery(a.page, WEEK, 'Carrots'), openGrocery(b.page, WEEK, 'Carrots')]);

    await uncheckedRow(a.page, 'Carrots').click();

    // Pushed over SSE; the polling fallback is far slower than this budget.
    const row = checkedRow(b.page, 'Carrots', ALICE.displayName);
    await expect(row).toBeVisible({ timeout: 1_500 });
    const chip = row.getByRole('img', { name: `Checked by ${ALICE.displayName}` });
    await expect(chip).toHaveText(ALICE.initials);

    // The other direction: Bob unchecks, Alice sees the box clear.
    await checkedRow(b.page, 'Carrots').click();
    await expect(uncheckedRow(a.page, 'Carrots')).toBeVisible({ timeout: 1_500 });

    // And a different item checked by Bob carries Bob's attribution on Alice's screen.
    await uncheckedRow(b.page, 'Dill').click();
    await expect(checkedRow(a.page, 'Dill', BOB.displayName)).toBeVisible({ timeout: 1_500 });
    await expect(
      checkedRow(a.page, 'Dill').getByRole('img', { name: `Checked by ${BOB.displayName}` })
    ).toHaveText(BOB.initials);

    const server = await getGroceries(new ApiClient(BOB), WEEK);
    const dill = server.checks.find((c) => c.itemKey === groceryKey('Dill'));
    expect(dill).toMatchObject({ checked: true, checkedBy: { displayName: BOB.displayName } });

    await a.context.close();
    await b.context.close();
  });
});
