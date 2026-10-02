/**
 * Verifies the routes publish the right bus events, and only when something
 * actually changed. Services are mocked; the bus is real.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { groceryRoutes } from '../routes/grocery.js';
import { pantryRoutes } from '../routes/pantry.js';
import { eventBus, resetEventBus, type BusEvent } from '../services/eventBus.js';

vi.mock('../services/customGroceries.js', () => ({
  addCustomItem: vi.fn(),
  updateCustomItem: vi.fn(),
  deleteCustomItem: vi.fn(),
}));
vi.mock('../services/groceryChecks.js', () => ({
  toggleCheck: vi.fn(),
  clearAllChecks: vi.fn(),
  clampClientTime: (t: number) => t,
  setCheck: vi.fn(),
  clearChecks: vi.fn(),
}));
vi.mock('../services/standingItems.js', () => ({
  listStandingItems: vi.fn(),
  addStandingItem: vi.fn(),
  deleteStandingItem: vi.fn(),
}));
vi.mock('../services/stores.js', () => ({ listStores: vi.fn() }));
vi.mock('../services/pantry.js', () => ({
  listPantryItems: vi.fn(),
  createPantryItem: vi.fn(),
  updatePantryItem: vi.fn(),
  deletePantryItem: vi.fn(),
}));

import * as custom from '../services/customGroceries.js';
import * as checks from '../services/groceryChecks.js';
import * as standing from '../services/standingItems.js';
import * as pantry from '../services/pantry.js';

const ID = '11111111-1111-4111-8111-111111111111';
const WEEK = '2026-02-24';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: 'integration-test-secret-must-be-32-chars!' });
  await app.register(authPlugin);
  await app.register(groceryRoutes);
  await app.register(pantryRoutes);
  await app.ready();
  return app;
}

let app: Awaited<ReturnType<typeof buildApp>>;
let seen: BusEvent[];

function call(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  const token = app.jwt.sign({
    userId: 'user-1',
    username: 'alice',
    role: 'member',
    familyId: 'family-1',
    isSuperAdmin: false,
  });
  return app.inject({
    method,
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  resetEventBus();
  seen = [];
  eventBus.subscribe('family-1', (e) => seen.push(e));
});

const types = () => seen.map((e) => e.type);

describe('event emission', () => {
  const customItem = { id: ID, weekDate: WEEK, name: 'Milk' };

  it('custom add emits only when created; update and delete emit', async () => {
    vi.mocked(custom.addCustomItem).mockResolvedValueOnce({
      item: customItem,
      created: true,
    } as never);
    await call('POST', '/api/grocery/custom', { id: ID, weekDate: WEEK, name: 'Milk' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'grocery.custom.add', data: customItem });

    vi.mocked(custom.addCustomItem).mockResolvedValueOnce({
      item: customItem,
      created: false,
    } as never);
    await call('POST', '/api/grocery/custom', { id: ID, weekDate: WEEK, name: 'Milk' });
    expect(seen).toHaveLength(1);

    vi.mocked(custom.updateCustomItem).mockResolvedValueOnce(customItem as never);
    await call('PATCH', `/api/grocery/custom/${ID}`, { name: 'Oat milk' });
    expect(types()).toEqual(['grocery.custom.add', 'grocery.custom.update']);

    vi.mocked(custom.deleteCustomItem).mockResolvedValueOnce({ deleted: true });
    await call('DELETE', `/api/grocery/custom/${ID}`);
    vi.mocked(custom.deleteCustomItem).mockResolvedValueOnce({ deleted: false });
    await call('DELETE', `/api/grocery/custom/${ID}`);
    expect(types()).toEqual([
      'grocery.custom.add',
      'grocery.custom.update',
      'grocery.custom.delete',
    ]);
    expect(seen[2].data).toEqual({ id: ID });
  });

  it('standing add/delete emit only on change', async () => {
    const item = { id: ID, name: 'Eggs' };
    vi.mocked(standing.addStandingItem).mockResolvedValueOnce({ item, created: true } as never);
    await call('POST', '/api/grocery/standing', { id: ID, name: 'Eggs' });
    vi.mocked(standing.addStandingItem).mockResolvedValueOnce({ item, created: false } as never);
    await call('POST', '/api/grocery/standing', { id: ID, name: 'Eggs' });
    vi.mocked(standing.deleteStandingItem).mockResolvedValueOnce({ deleted: true });
    await call('DELETE', `/api/grocery/standing/${ID}`);
    vi.mocked(standing.deleteStandingItem).mockResolvedValueOnce({ deleted: false });
    await call('DELETE', `/api/grocery/standing/${ID}`);
    expect(types()).toEqual(['grocery.standing.add', 'grocery.standing.delete']);
    expect(seen[0].data).toEqual(item);
    expect(seen[1].data).toEqual({ id: ID });
  });

  it('pantry add/update/delete emit only on change', async () => {
    const item = { id: ID, ingredientName: 'Oil' };
    vi.mocked(pantry.createPantryItem).mockResolvedValueOnce({ item, created: true } as never);
    await call('POST', '/api/pantry', { id: ID, ingredientName: 'Oil' });
    vi.mocked(pantry.createPantryItem).mockResolvedValueOnce({ item, created: false } as never);
    await call('POST', '/api/pantry', { id: ID, ingredientName: 'Oil' });
    vi.mocked(pantry.updatePantryItem).mockResolvedValueOnce(item as never);
    await call('PATCH', `/api/pantry/${ID}`, { quantity: 2 });
    vi.mocked(pantry.updatePantryItem).mockResolvedValueOnce(null as never);
    await call('PATCH', `/api/pantry/${ID}`, { quantity: 2 });
    vi.mocked(pantry.deletePantryItem).mockResolvedValueOnce({ deleted: true });
    await call('DELETE', `/api/pantry/${ID}`);
    vi.mocked(pantry.deletePantryItem).mockResolvedValueOnce({ deleted: false });
    await call('DELETE', `/api/pantry/${ID}`);
    expect(types()).toEqual(['pantry.add', 'pantry.update', 'pantry.delete']);
    expect(seen[2].data).toEqual({ id: ID });
  });

  it('PUT check emits only when changed', async () => {
    const check = { itemKey: 'k', checked: true, updatedAt: 5, checkedBy: null };
    const body = { weekDate: WEEK, itemKey: 'k', itemName: 'K', checked: true, clientUpdatedAt: 5 };
    vi.mocked(checks.setCheck).mockResolvedValueOnce({ check, changed: false });
    await call('PUT', '/api/grocery/checks', body);
    expect(seen).toHaveLength(0);
    vi.mocked(checks.setCheck).mockResolvedValueOnce({ check, changed: true });
    await call('PUT', '/api/grocery/checks', body);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'grocery.check',
      data: { weekDate: WEEK, itemKey: 'k', checked: true, updatedAt: 5, checkedBy: null },
    });
  });

  it('legacy toggle emits grocery.check', async () => {
    vi.mocked(checks.toggleCheck).mockResolvedValueOnce({
      checked: true,
      check: {
        itemKey: 'k',
        checked: true,
        updatedAt: 9,
        checkedBy: { id: 'u', displayName: 'U' },
      },
    });
    await call('POST', '/api/grocery/checks/toggle', {
      weekDate: WEEK,
      itemKey: 'k',
      itemName: 'K',
    });
    expect(seen[0]).toMatchObject({ type: 'grocery.check', data: { updatedAt: 9, checked: true } });
  });

  it('clear emits grocery.clear only when count > 0 (POST and legacy DELETE)', async () => {
    vi.mocked(checks.clearChecks).mockResolvedValueOnce(0);
    await call('POST', '/api/grocery/checks/clear', { weekDate: WEEK, clientUpdatedAt: 100 });
    vi.mocked(checks.clearChecks).mockResolvedValueOnce(3);
    await call('POST', '/api/grocery/checks/clear', { weekDate: WEEK, clientUpdatedAt: 100 });
    vi.mocked(checks.clearAllChecks).mockResolvedValueOnce({ cleared: 0, at: 1 });
    await call('DELETE', `/api/grocery/checks?weekDate=${WEEK}`);
    vi.mocked(checks.clearAllChecks).mockResolvedValueOnce({ cleared: 2, at: 777 });
    await call('DELETE', `/api/grocery/checks?weekDate=${WEEK}`);
    expect(seen.map((e) => e.data)).toEqual([
      { weekDate: WEEK, at: 100 },
      { weekDate: WEEK, at: 777 },
    ]);
    expect(types()).toEqual(['grocery.clear', 'grocery.clear']);
  });
});
