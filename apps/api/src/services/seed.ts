import crypto from 'crypto';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { hashPassword } from './auth.js';

/**
 * Seeds the admin user on first run if no users exist
 * Uses ADMIN_USERNAME and ADMIN_PASSWORD from environment
 * If ADMIN_PASSWORD is not set, generates a random password and logs it
 */
export async function seedAdmin(): Promise<void> {
  // Check if any users exist
  const existingUsers = await db.select().from(schema.users).limit(1);

  if (existingUsers.length > 0) {
    console.log('Users already exist, skipping admin seed');
    return;
  }

  // Generate or use provided password
  let password = config.ADMIN_PASSWORD;
  let generatedPassword = false;

  if (!password) {
    password = crypto.randomBytes(16).toString('hex');
    generatedPassword = true;
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create admin user
  const adminId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: adminId,
    username: config.ADMIN_USERNAME,
    displayName: 'Administrator',
    passwordHash,
    role: 'admin',
    theme: 'light',
    homeView: 'today',
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Admin user created successfully!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   Username: ${config.ADMIN_USERNAME}`);

  if (generatedPassword) {
    console.log(`   Password: ${password}`);
    console.log('');
    console.log('   ⚠️  IMPORTANT: Save this password! It will not be shown again.');
    console.log('   Set ADMIN_PASSWORD environment variable to use a specific password.');
  } else {
    console.log('   Password: (using ADMIN_PASSWORD from environment)');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Also seed default app settings
  const existingSettings = await db.select().from(schema.appSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(schema.appSettings).values({
      id: 'default',
      weekStartDay: 0, // Sunday
    });
    console.log('Default app settings created');
  }
}
