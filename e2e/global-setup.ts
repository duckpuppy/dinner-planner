import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type FullConfig } from '@playwright/test';
import { ALICE, BASE_URL, BOB, ApiClient, nextFakeIp, type TestUser } from './support/api';

export const AUTH_DIR = fileURLToPath(new URL('./.tmp/auth', import.meta.url));
export const authFile = (user: TestUser) => `${AUTH_DIR}/${user.key}.json`;

/** Name the seeded admin, add a second user in the same family, then one UI login per user. */
export default async function globalSetup(_config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });

  // The API seeds the first admin (family + user) on boot from ADMIN_USERNAME/ADMIN_PASSWORD
  // (see playwright.config.ts), so `POST /api/setup` is unreachable: it 404s once any user exists.
  // Alice is the family admin: give her a real display name, then create Bob alongside her.
  const alice = new ApiClient(ALICE);
  await alice.login();
  const me = await alice.get<{ user: { id: string } }>('/api/auth/me');
  await alice.patch(`/api/users/${me.user.id}`, { displayName: ALICE.displayName });
  await alice.post('/api/users', {
    username: BOB.username,
    displayName: BOB.displayName,
    password: BOB.password,
    role: 'member',
  });

  const browser = await chromium.launch();
  try {
    for (const user of [ALICE, BOB]) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        extraHTTPHeaders: { 'X-Forwarded-For': nextFakeIp() },
      });
      const page = await context.newPage();
      await page.goto('/login');
      await page.getByLabel('Username').fill(user.username);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: /sign in|log in/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'));
      await context.storageState({ path: authFile(user) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
