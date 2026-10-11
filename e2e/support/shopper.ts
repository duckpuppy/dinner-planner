import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { authFile } from '../global-setup';
import { BASE_URL, nextFakeIp, type TestUser } from './api';

export interface Shopper {
  user: TestUser;
  context: BrowserContext;
  page: Page;
}

/** A signed-in browser context for one family member (restored from globalSetup's login). */
export async function newShopper(browser: Browser, user: TestUser): Promise<Shopper> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: authFile(user),
    // Distinct client IP per context so the API's per-IP rate limits stay independent.
    extraHTTPHeaders: { 'X-Forwarded-For': nextFakeIp() },
  });
  const page = await context.newPage();
  return { user, context, page };
}

/**
 * Open the Grocery page for `week` and resolve once the list has rendered and the live
 * (SSE) stream is established, so later changes by another shopper are pushed, not polled.
 */
export async function openGrocery(page: Page, week: string, firstItem: string): Promise<void> {
  const liveStream = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/events');
  await page.goto(`/grocery?date=${week}`);
  await expect(page.getByRole('heading', { name: 'Grocery List' })).toBeVisible();
  await expect(itemRow(page, firstItem)).toBeVisible();
  await liveStream;
}

/** The toggle button for a recipe ingredient, whether it is currently checked or not. */
export function itemRow(page: Page, name: string): Locator {
  return page.getByRole('button', {
    name: new RegExp(`^(Check|Uncheck) ${escapeRe(name)}(,| \\(|$)`),
  });
}

export function uncheckedRow(page: Page, name: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^Check ${escapeRe(name)}( \\(|$)`) });
}

/** Checked row, optionally asserting who checked it. */
export function checkedRow(page: Page, name: string, by?: string): Locator {
  const rest = by ? `, checked by ${escapeRe(by)}( \\(|$)` : '(,| \\(|$)';
  return page.getByRole('button', { name: new RegExp(`^Uncheck ${escapeRe(name)}${rest}`) });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function banner(page: Page): Locator {
  return page.getByRole('status');
}

/**
 * The offline cold start needs the service worker to control the page (it serves the app shell
 * with no network). It registers after first load, so reload once if it is not yet in control.
 */
export async function ensureServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const controlled = () => page.evaluate(() => navigator.serviceWorker.controller !== null);
  if (!(await controlled())) {
    await page.reload();
    await expect.poll(controlled).toBe(true);
  }
}

/** Read a value the app persisted with idb-keyval (default DB `keyval-store`). */
export function idbGet<T = unknown>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(
    (k) =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('keyval')) {
            db.close();
            resolve(undefined);
            return;
          }
          const req = db.transaction('keyval', 'readonly').objectStore('keyval').get(k);
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        };
      }) as Promise<T | undefined>,
    key
  );
}

export const QUERY_CACHE_KEY = 'dinner-planner-query-cache';
export const MUTATION_QUEUE_KEY = 'dinner-planner-mutation-queue';

/** Wait until the app has written the grocery list to its IndexedDB query cache. */
export async function waitForPersistedList(page: Page, sampleItem: string): Promise<void> {
  await expect
    .poll(async () =>
      JSON.stringify((await idbGet(page, QUERY_CACHE_KEY)) ?? '').includes(sampleItem)
    )
    .toBe(true);
}

/** Wait until the offline mutation queue in IndexedDB holds `count` operations. */
export async function waitForPersistedQueue(page: Page, count: number): Promise<void> {
  await expect
    .poll(async () => {
      const stored = await idbGet<{ mutations?: unknown[] }>(page, MUTATION_QUEUE_KEY);
      return stored?.mutations?.length ?? 0;
    })
    .toBe(count);
}

/** A date `weeksAhead` weeks from today (YYYY-MM-DD, local). Each test uses its own week. */
export function weekFromNow(weeksAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weeksAhead * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
