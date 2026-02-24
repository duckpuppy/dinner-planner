import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashPassword, verifyPassword } from './auth.js';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserPreferencesInput,
  DietaryTag,
} from '@dinner-planner/shared';

export interface UserResponse {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  theme: 'light' | 'dark';
  homeView: 'today' | 'week';
  dietaryPreferences: DietaryTag[];
  createdAt: string;
  updatedAt: string;
}

function parseDietaryPreferences(raw: string): DietaryTag[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DietaryTag[]) : [];
  } catch {
    return [];
  }
}

function toUserResponse(user: typeof schema.users.$inferSelect): UserResponse {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    theme: user.theme,
    homeView: user.homeView,
    dietaryPreferences: parseDietaryPreferences(user.dietaryPreferences),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Get all users
 */
export async function getAllUsers(): Promise<UserResponse[]> {
  const users = await db.select().from(schema.users);
  return users.map(toUserResponse);
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });

  return user ? toUserResponse(user) : null;
}

/**
 * Create a new user (admin only)
 */
export async function createUser(input: CreateUserInput): Promise<UserResponse> {
  // Check if username already exists
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.username, input.username),
  });

  if (existing) {
    throw new Error('Username already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.users).values({
    id,
    username: input.username,
    displayName: input.displayName,
    passwordHash,
    role: input.role,
    theme: 'light',
    homeView: 'today',
    dietaryPreferences: '[]',
    createdAt: now,
    updatedAt: now,
  });

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });

  return toUserResponse(user!);
}

/**
 * Update user (admin only)
 */
export async function updateUser(id: string, input: UpdateUserInput): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });

  if (!user) {
    return null;
  }

  const now = new Date().toISOString();

  await db
    .update(schema.users)
    .set({
      ...input,
      updatedAt: now,
    })
    .where(eq(schema.users.id, id));

  const updated = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });

  return toUserResponse(updated!);
}

/**
 * Update user preferences (own profile)
 */
export async function updateUserPreferences(
  id: string,
  input: UserPreferencesInput
): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });

  if (!user) {
    return null;
  }

  const now = new Date().toISOString();

  const updateData: Record<string, unknown> = { updatedAt: now };
  if (input.theme !== undefined) updateData.theme = input.theme;
  if (input.homeView !== undefined) updateData.homeView = input.homeView;
  if (input.dietaryPreferences !== undefined) {
    updateData.dietaryPreferences = JSON.stringify(input.dietaryPreferences);
  }

  await db.update(schema.users).set(updateData).where(eq(schema.users.id, id));

  const updated = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });

  return toUserResponse(updated!);
}

/**
 * Change user password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    return { success: false, error: 'Current password is incorrect' };
  }

  const newPasswordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  await db
    .update(schema.users)
    .set({
      passwordHash: newPasswordHash,
      updatedAt: now,
    })
    .where(eq(schema.users.id, userId));

  return { success: true };
}

/**
 * Reset user password (admin only)
 */
export async function resetPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  const newPasswordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  await db
    .update(schema.users)
    .set({
      passwordHash: newPasswordHash,
      updatedAt: now,
    })
    .where(eq(schema.users.id, userId));

  return { success: true };
}

/**
 * Delete user (admin only)
 */
export async function deleteUser(
  userId: string,
  requesterId: string
): Promise<{ success: boolean; error?: string }> {
  // Prevent self-deletion
  if (userId === requesterId) {
    return { success: false, error: 'Cannot delete your own account' };
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Delete refresh tokens first
  await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, userId));

  // Delete user
  await db.delete(schema.users).where(eq(schema.users.id, userId));

  return { success: true };
}
