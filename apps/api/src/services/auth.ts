import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { eq, and, lt, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';

const SALT_ROUNDS = 12;

export interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'member';
}

export interface AuthResult {
  user: {
    id: string;
    username: string;
    displayName: string;
    role: 'admin' | 'member';
    theme: 'light' | 'dark';
    homeView: 'today' | 'week';
  };
  accessToken: string;
  refreshToken: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a refresh token for storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Calculate expiry date from duration string (e.g., '15m', '7d')
 */
function calculateExpiry(duration: string): Date {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = new Date();
  switch (unit) {
    case 's':
      return new Date(now.getTime() + value * 1000);
    case 'm':
      return new Date(now.getTime() + value * 60 * 1000);
    case 'h':
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'd':
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}

/**
 * Authenticate a user and return tokens
 */
export async function login(
  username: string,
  password: string,
  signAccessToken: (payload: TokenPayload) => string
): Promise<AuthResult | null> {
  // Find user by username
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });

  if (!user) {
    return null;
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  // Generate tokens
  const accessToken = signAccessToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const refreshToken = generateToken();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = calculateExpiry(config.JWT_REFRESH_EXPIRY);

  // Store refresh token
  await db.insert(schema.refreshTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      theme: user.theme,
      homeView: user.homeView,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh access token using a valid refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  signAccessToken: (payload: TokenPayload) => string
): Promise<{ accessToken: string; user: AuthResult['user'] } | null> {
  const tokenHash = hashToken(refreshToken);
  const now = new Date().toISOString();

  // Find valid refresh token
  const storedToken = await db.query.refreshTokens.findFirst({
    where: and(
      eq(schema.refreshTokens.tokenHash, tokenHash),
      gt(schema.refreshTokens.expiresAt, now)
    ),
  });

  if (!storedToken) {
    return null;
  }

  // Get user
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, storedToken.userId),
  });

  if (!user) {
    return null;
  }

  // Generate new access token
  const accessToken = signAccessToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  return {
    accessToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      theme: user.theme,
      homeView: user.homeView,
    },
  };
}

/**
 * Logout - invalidate refresh token
 */
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);

  await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.tokenHash, tokenHash));
}

/**
 * Logout all sessions for a user
 */
export async function logoutAll(userId: string): Promise<void> {
  await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, userId));
}

/**
 * Clean up expired refresh tokens
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .delete(schema.refreshTokens)
    .where(lt(schema.refreshTokens.expiresAt, now));

  return result.changes;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
}
