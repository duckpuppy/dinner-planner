import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db, schema } from '../db/index.js';

/**
 * Returns true if no users exist in the database (setup not yet completed).
 */
export async function isSetupRequired(): Promise<boolean> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
  return result[0].count === 0;
}

/**
 * Creates the first admin user during initial setup.
 * Returns { success: false } if users already exist (setup already done).
 * Returns { success: true } on success.
 */
export async function createFirstAdmin(
  username: string,
  password: string
): Promise<{ success: boolean }> {
  const setupRequired = await isSetupRequired();
  if (!setupRequired) {
    return { success: false };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const adminId = crypto.randomUUID();

  await db.insert(schema.users).values({
    id: adminId,
    username,
    displayName: username,
    passwordHash,
    role: 'admin',
    theme: 'light',
    homeView: 'today',
    dietaryPreferences: '[]',
  });

  // Upsert default app settings if not present
  const existingSettings = await db.select().from(schema.appSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(schema.appSettings).values({
      id: 'default',
      weekStartDay: 0,
    });
  }

  return { success: true };
}
