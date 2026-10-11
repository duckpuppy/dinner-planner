/**
 * Display links (dpk_) + read-only GET /api/kiosk/week.
 * Uses the real per-worker SQLite database (migrated in beforeAll) so the
 * read-only guarantee and photo fallbacks are exercised against real queries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import crypto from 'crypto';
import { Writable } from 'stream';
import { eq, count } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import jwtPlugin from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { db, schema, sqlite } from '../db/index.js';
import authPlugin from '../middleware/auth.js';
import { displayLinksRoutes } from '../routes/displayLinks.js';
import { kioskRoutes } from '../routes/kiosk.js';
import { loggerSerializers, redactUrl } from '../logSerializers.js';
import { hashDisplayKey } from '../services/displayLinks.js';

const SECRET = 'kiosk-test-secret-must-be-at-least-32-chars!!';
const run = crypto.randomUUID().slice(0, 8);
const FAM_A = `fam-a-${run}`;
const FAM_B = `fam-b-${run}`;
const ADMIN_A = `admin-a-${run}`;
const ADMIN_B = `admin-b-${run}`;
const MEMBER_A = `member-a-${run}`;
// Wednesday; with the default Sunday week start the week is 2031-03-02..08
const DATE = '2031-03-05';
const WEEK_START = '2031-03-02';

async function buildApp(logStream?: Writable) {
  const app = Fastify({
    logger: logStream
      ? { level: 'info', stream: logStream, serializers: loggerSerializers }
      : false,
  });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: SECRET });
  await app.register(authPlugin);
  await app.register(displayLinksRoutes);
  await app.register(kioskRoutes);
  // A normal authenticated route, to prove dpk_ keys are rejected
  app.get('/api/_probe', { preHandler: [app.authenticate] }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

type App = Awaited<ReturnType<typeof buildApp>>;

function jwt(app: App, userId: string, familyId: string, role: 'admin' | 'member' = 'admin') {
  return {
    Authorization: `Bearer ${app.jwt.sign({ userId, username: userId, role, familyId, isSuperAdmin: false })}`,
  };
}

function seedUser(id: string, familyId: string, role: 'admin' | 'member') {
  db.insert(schema.users)
    .values({
      id,
      username: id,
      displayName: id,
      passwordHash: 'x',
      familyId,
      role,
    })
    .run();
}

async function createLink(app: App, headers: Record<string, string>, name = 'Kitchen') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/display-links',
    headers,
    payload: { name },
  });
  return { res, body: res.json() };
}

function seedDish(
  id: string,
  familyId: string,
  extra: Partial<typeof schema.dishes.$inferInsert> = {}
) {
  db.insert(schema.dishes)
    .values({
      id,
      familyId,
      name: `Dish ${id}`,
      type: 'main',
      createdById: familyId === FAM_A ? ADMIN_A : ADMIN_B,
      ...extra,
    })
    .run();
}

describe('display links + kiosk', () => {
  let app: App;
  let adminA: Record<string, string>;
  let adminB: Record<string, string>;

  beforeAll(async () => {
    sqlite.pragma('foreign_keys = OFF');
    migrate(db, { migrationsFolder: './drizzle' });
    sqlite.pragma('foreign_keys = ON');

    db.insert(schema.families).values({ id: FAM_A, name: 'A' }).run();
    db.insert(schema.families).values({ id: FAM_B, name: 'B' }).run();
    seedUser(ADMIN_A, FAM_A, 'admin');
    seedUser(MEMBER_A, FAM_A, 'member');
    seedUser(ADMIN_B, FAM_B, 'admin');

    app = await buildApp();
    adminA = jwt(app, ADMIN_A, FAM_A);
    adminB = jwt(app, ADMIN_B, FAM_B);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('admin CRUD', () => {
    it('creates a link, returns the token once and stores only its sha256', async () => {
      const { res, body } = await createLink(app, adminA, 'Fridge tablet');
      expect(res.statusCode).toBe(201);
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'id', 'name', 'token', 'url']);
      expect(body.token).toMatch(/^dpk_[0-9a-f]{64}$/);
      expect(body.url).toBe(`/kiosk?key=${body.token}`);

      const row = db
        .select()
        .from(schema.displayLinks)
        .where(eq(schema.displayLinks.id, body.id))
        .get()!;
      expect(row.tokenHash).toBe(hashDisplayKey(body.token));
      expect(JSON.stringify(row)).not.toContain(body.token);
      expect(row.familyId).toBe(FAM_A);
      expect(row.createdByUserId).toBe(ADMIN_A);
    });

    it('lists active links for the family without tokens', async () => {
      const { body: created } = await createLink(app, adminA, 'Listed');
      const res = await app.inject({ method: 'GET', url: '/api/display-links', headers: adminA });
      expect(res.statusCode).toBe(200);
      const { displayLinks } = res.json();
      const found = displayLinks.find((l: { id: string }) => l.id === created.id);
      expect(Object.keys(found).sort()).toEqual([
        'createdAt',
        'createdByUserId',
        'id',
        'lastUsedAt',
        'name',
      ]);
      expect(JSON.stringify(displayLinks)).not.toContain('dpk_');

      const other = await app.inject({ method: 'GET', url: '/api/display-links', headers: adminB });
      expect(other.json().displayLinks.map((l: { id: string }) => l.id)).not.toContain(created.id);
    });

    it('revokes a link and drops it from the list', async () => {
      const { body: created } = await createLink(app, adminA, 'Doomed');
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/display-links/${created.id}`,
        headers: adminA,
      });
      expect(del.statusCode).toBe(200);
      const list = await app.inject({ method: 'GET', url: '/api/display-links', headers: adminA });
      expect(list.json().displayLinks.map((l: { id: string }) => l.id)).not.toContain(created.id);

      const again = await app.inject({
        method: 'DELETE',
        url: `/api/display-links/${created.id}`,
        headers: adminA,
      });
      expect(again.statusCode).toBe(404);
    });

    it('returns 404 when another family deletes a link, and leaves it working', async () => {
      const { body: created } = await createLink(app, adminA, 'Mine');
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/display-links/${created.id}`,
        headers: adminB,
      });
      expect(del.statusCode).toBe(404);
      const week = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}`,
        headers: { Authorization: `Bearer ${created.token}` },
      });
      expect(week.statusCode).toBe(200);
    });

    it('requires admin, auth and a valid name', async () => {
      const member = jwt(app, MEMBER_A, FAM_A, 'member');
      expect((await createLink(app, member)).res.statusCode).toBe(403);
      expect((await createLink(app, {})).res.statusCode).toBe(401);
      expect((await createLink(app, adminA, '   ')).res.statusCode).toBe(400);
    });
  });

  describe('dpk_ keys are not user credentials', () => {
    it('is rejected by fastify.authenticate and by admin routes', async () => {
      const { body } = await createLink(app, adminA);
      const bearer = { Authorization: `Bearer ${body.token}` };

      const probe = await app.inject({ method: 'GET', url: '/api/_probe', headers: bearer });
      expect(probe.statusCode).toBe(401);

      const list = await app.inject({ method: 'GET', url: '/api/display-links', headers: bearer });
      expect(list.statusCode).toBe(401);
      const create = await createLink(app, bearer);
      expect(create.res.statusCode).toBe(401);
    });

    it('a normal JWT is not accepted by the kiosk endpoint', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}`,
        headers: adminA,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/kiosk/week auth', () => {
    it('accepts the header and ?key=, rejects missing, wrong and revoked keys', async () => {
      const { body } = await createLink(app, adminA, 'Auth');

      const viaHeader = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}`,
        headers: { Authorization: `Bearer ${body.token}` },
      });
      expect(viaHeader.statusCode).toBe(200);
      expect(viaHeader.headers['cache-control']).toBe('no-store');

      const viaQuery = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}&key=${body.token}`,
      });
      expect(viaQuery.statusCode).toBe(200);

      expect((await app.inject({ method: 'GET', url: '/api/kiosk/week' })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'GET', url: '/api/kiosk/week?key=dpk_nope' })).statusCode
      ).toBe(401);
      expect(
        (await app.inject({ method: 'GET', url: '/api/kiosk/week?key=dp_nope' })).statusCode
      ).toBe(401);

      await app.inject({
        method: 'DELETE',
        url: `/api/display-links/${body.id}`,
        headers: adminA,
      });
      const revoked = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}&key=${body.token}`,
      });
      expect(revoked.statusCode).toBe(401);
      const revokedHeader = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}`,
        headers: { Authorization: `Bearer ${body.token}` },
      });
      expect(revokedHeader.statusCode).toBe(401);
    });

    it('records last_used_at and validates the date', async () => {
      const { body } = await createLink(app, adminA, 'Used');
      const bad = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=2031-13-45&key=${body.token}`,
      });
      expect(bad.statusCode).toBe(400);
      const bad2 = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=tomorrow&key=${body.token}`,
      });
      expect(bad2.statusCode).toBe(400);

      const row = db
        .select()
        .from(schema.displayLinks)
        .where(eq(schema.displayLinks.id, body.id))
        .get()!;
      expect(row.lastUsedAt).not.toBeNull();
    });
  });

  describe('GET /api/kiosk/week data', () => {
    it('does not create a menu or entries and returns 7 empty days', async () => {
      const { body } = await createLink(app, adminA, 'Empty');
      const countRows = () => ({
        menus: db.select({ n: count() }).from(schema.weeklyMenus).get()!.n,
        entries: db.select({ n: count() }).from(schema.dinnerEntries).get()!.n,
      });
      const before = countRows();

      const res = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=2032-07-14&key=${body.token}`,
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.entries).toHaveLength(7);
      expect(json.weekStartDate).toBe('2032-07-11');
      expect(json.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const day of json.entries) {
        expect(day.type).toBeNull();
        expect(day.mainDish).toBeNull();
        expect(day.sides).toEqual([]);
        expect(day.prepTasks).toEqual([]);
      }
      expect(countRows()).toEqual(before);
    });

    it('returns entries, sides, prep tasks, leftovers and photo fallbacks (family scoped)', async () => {
      const menuId = `menu-a-${run}`;
      const otherMenuId = `menu-b-${run}`;
      db.insert(schema.weeklyMenus)
        .values({ id: menuId, familyId: FAM_A, weekStartDate: WEEK_START })
        .run();
      db.insert(schema.weeklyMenus)
        .values({ id: otherMenuId, familyId: FAM_B, weekStartDate: WEEK_START })
        .run();

      seedDish(`photo-${run}`, FAM_A, {
        prepTime: 10,
        cookTime: 25,
        videoThumbnailFilename: 'ignored.jpg',
      });
      seedDish(`thumb-${run}`, FAM_A, { videoThumbnailFilename: 'thumb.jpg' });
      seedDish(`bare-${run}`, FAM_A);
      seedDish(`side-${run}`, FAM_A, { type: 'side' });
      seedDish(`foreign-${run}`, FAM_B);

      // Two preparations with photos; the newest photo must win
      const prepIds = [`prep1-${run}`, `prep2-${run}`];
      const entryFor = (i: number) => `e${i}-${run}`;
      const days = [0, 1, 2, 3, 4, 5, 6].map((i) => `2031-03-0${2 + i}`);
      const mk = (i: number, v: Partial<typeof schema.dinnerEntries.$inferInsert>) =>
        db
          .insert(schema.dinnerEntries)
          .values({ id: entryFor(i), menuId, date: days[i], ...v })
          .run();

      mk(0, { type: 'assembled', mainDishId: `bare-${run}` });
      mk(1, { type: 'assembled', mainDishId: `photo-${run}`, completed: true });
      mk(2, { type: 'assembled', mainDishId: `thumb-${run}` });
      mk(3, { type: 'dining_out', restaurantName: 'Luigi', restaurantNotes: '7pm' });
      mk(4, { type: 'leftovers', sourceEntryId: entryFor(1) });
      mk(5, { type: 'custom', customText: 'Pizza night', customSideText: 'Salad', skipped: true });
      mk(6, { type: 'fend_for_self' });
      // Foreign family's entry on the same date must never leak
      db.insert(schema.dinnerEntries)
        .values({
          id: `foreign-entry-${run}`,
          menuId: otherMenuId,
          date: days[1],
          type: 'assembled',
          mainDishId: `foreign-${run}`,
        })
        .run();

      db.insert(schema.entrySideDishes)
        .values({ entryId: entryFor(1), dishId: `side-${run}` })
        .run();
      db.insert(schema.prepTasks)
        .values({
          id: `t1-${run}`,
          entryId: entryFor(1),
          description: 'Thaw chicken',
          completed: true,
        })
        .run();
      db.insert(schema.prepTasks)
        .values({ id: `t2-${run}`, entryId: entryFor(1), description: 'Chop onions' })
        .run();

      prepIds.forEach((id) =>
        db
          .insert(schema.preparations)
          .values({
            id,
            dishId: `photo-${run}`,
            dinnerEntryId: entryFor(1),
            preparedDate: days[1],
          })
          .run()
      );
      db.insert(schema.photos)
        .values({
          id: `ph1-${run}`,
          preparationId: prepIds[0],
          uploadedById: ADMIN_A,
          filename: 'old.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          createdAt: '2031-01-01 10:00:00',
        })
        .run();
      db.insert(schema.photos)
        .values({
          id: `ph2-${run}`,
          preparationId: prepIds[1],
          uploadedById: ADMIN_A,
          filename: 'new.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          createdAt: '2031-02-01 10:00:00',
        })
        .run();

      const { body } = await createLink(app, adminA, 'Data');
      const res = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}`,
        headers: { Authorization: `Bearer ${body.token}` },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Object.keys(json).sort()).toEqual(['entries', 'today', 'weekStartDate']);
      expect(json.weekStartDate).toBe(WEEK_START);
      expect(json.entries.map((e: { date: string }) => e.date)).toEqual(days);

      const [bare, withPhoto, thumb, out, left, custom, ffs] = json.entries;
      expect(Object.keys(withPhoto).sort()).toEqual([
        'completed',
        'customSideText',
        'customText',
        'date',
        'leftoversSource',
        'mainDish',
        'prepTasks',
        'restaurantName',
        'restaurantNotes',
        'sides',
        'skipped',
        'type',
      ]);

      // Photo fallbacks: newest prep photo > video thumbnail > null
      expect(withPhoto.mainDish).toEqual({
        id: `photo-${run}`,
        name: `Dish photo-${run}`,
        prepTime: 10,
        cookTime: 25,
        photoUrl: '/uploads/new.jpg',
      });
      expect(thumb.mainDish.photoUrl).toBe('/videos/thumb.jpg');
      expect(bare.mainDish.photoUrl).toBeNull();

      expect(withPhoto.completed).toBe(true);
      expect(withPhoto.sides).toEqual([{ id: `side-${run}`, name: `Dish side-${run}` }]);
      expect(withPhoto.prepTasks).toEqual([
        { description: 'Thaw chicken', completed: true },
        { description: 'Chop onions', completed: false },
      ]);

      expect(out).toMatchObject({
        type: 'dining_out',
        restaurantName: 'Luigi',
        restaurantNotes: '7pm',
      });
      expect(left.type).toBe('leftovers');
      expect(left.leftoversSource).toEqual({
        date: days[1],
        dishName: `Dish photo-${run}`,
        photoUrl: '/uploads/new.jpg',
      });
      expect(custom).toMatchObject({
        type: 'custom',
        customText: 'Pizza night',
        customSideText: 'Salad',
        skipped: true,
      });
      expect(ffs.type).toBe('fend_for_self');

      // No other family's data
      expect(JSON.stringify(json)).not.toContain(`foreign-${run}`);

      // Family B's key sees only its own entry
      const { body: bKey } = await createLink(app, adminB, 'B');
      const resB = await app.inject({
        method: 'GET',
        url: `/api/kiosk/week?date=${DATE}&key=${bKey.token}`,
      });
      const jsonB = resB.json();
      expect(jsonB.entries[1].mainDish.name).toBe(`Dish foreign-${run}`);
      expect(JSON.stringify(jsonB)).not.toContain(`photo-${run}`);
    });
  });

  describe('logging', () => {
    it('redactUrl masks the key value', () => {
      expect(redactUrl('/api/kiosk/week?date=2031-03-05&key=dpk_abc123&x=1')).toBe(
        '/api/kiosk/week?date=2031-03-05&key=[REDACTED]&x=1'
      );
      expect(redactUrl('/api/kiosk/week?key=dpk_abc')).toBe('/api/kiosk/week?key=[REDACTED]');
      expect(redactUrl('/api/health')).toBe('/api/health');
    });

    it('never writes the ?key= value to request logs', async () => {
      let logs = '';
      const stream = new Writable({
        write(chunk, _enc, cb) {
          logs += chunk.toString();
          cb();
        },
      });
      const logApp = await buildApp(stream);
      try {
        const { body } = await createLink(logApp, jwt(logApp, ADMIN_A, FAM_A), 'Logged');
        // Success, 401 and 400 paths all log the request
        await logApp.inject({
          method: 'GET',
          url: `/api/kiosk/week?date=${DATE}&key=${body.token}`,
        });
        await logApp.inject({ method: 'GET', url: `/api/kiosk/week?date=bad&key=${body.token}` });
        await logApp.inject({ method: 'GET', url: '/api/kiosk/week?key=dpk_secretsecret' });

        expect(logs).toContain('/api/kiosk/week');
        expect(logs).toContain('[REDACTED]');
        expect(logs).not.toContain(body.token);
        expect(logs).not.toContain('dpk_secretsecret');
      } finally {
        await logApp.close();
      }
    });
  });
});
