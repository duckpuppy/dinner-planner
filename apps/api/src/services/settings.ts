import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export async function getSettings() {
  const [settings] = await db.select().from(schema.appSettings).limit(1);
  if (!settings) {
    throw new Error('Settings not found');
  }
  return settings;
}

export async function updateSettings(data: { weekStartDay?: number }) {
  const settings = await getSettings();
  const [updated] = await db
    .update(schema.appSettings)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.appSettings.id, settings.id))
    .returning();
  return updated;
}
