import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createWriteStream, unlink } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { db } from '../db/index.js';
import { photos, preparations } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const UPLOADS_DIR = join(__dirname, '../../data/uploads');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface PhotoResponse {
  id: string;
  preparationId: string;
  uploadedById: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

function photoUrl(filename: string): string {
  return `/uploads/${filename}`;
}

export async function getPhotosForPreparation(preparationId: string): Promise<PhotoResponse[]> {
  const rows = await db.select().from(photos).where(eq(photos.preparationId, preparationId));
  return rows.map((p) => ({ ...p, url: photoUrl(p.filename) }));
}

export async function uploadPhoto(
  preparationId: string,
  uploadedById: string,
  file: { filename: string; mimetype: string; file: NodeJS.ReadableStream }
): Promise<PhotoResponse> {
  // Validate preparation exists
  const [prep] = await db
    .select({ id: preparations.id })
    .from(preparations)
    .where(eq(preparations.id, preparationId));
  if (!prep) {
    throw Object.assign(new Error('Preparation not found'), { statusCode: 404 });
  }

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw Object.assign(new Error('Only JPEG, PNG, WebP and GIF images are allowed'), {
      statusCode: 400,
    });
  }

  const ext = extname(file.filename) || `.${file.mimetype.split('/')[1]}`;
  const storedFilename = `${randomUUID()}${ext}`;
  const filePath = join(UPLOADS_DIR, storedFilename);

  // Stream upload to disk with size limit
  let bytesWritten = 0;
  const writeStream = createWriteStream(filePath);

  try {
    await pipeline(
      file.file,
      async function* (source) {
        for await (const chunk of source) {
          bytesWritten += chunk.length;
          if (bytesWritten > MAX_FILE_SIZE) {
            throw Object.assign(new Error('File exceeds 10 MB limit'), { statusCode: 400 });
          }
          yield chunk;
        }
      },
      writeStream
    );
  } catch (err) {
    // Clean up partial file on error
    unlink(filePath, () => {});
    throw err;
  }

  const id = randomUUID();
  const [row] = await db
    .insert(photos)
    .values({
      id,
      preparationId,
      uploadedById,
      filename: storedFilename,
      mimeType: file.mimetype,
      size: bytesWritten,
    })
    .returning();

  return { ...row, url: photoUrl(row.filename) };
}

export async function deletePhoto(
  photoId: string,
  requestingUserId: string,
  isAdmin: boolean
): Promise<void> {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!photo) {
    throw Object.assign(new Error('Photo not found'), { statusCode: 404 });
  }
  if (!isAdmin && photo.uploadedById !== requestingUserId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  await db.delete(photos).where(eq(photos.id, photoId));
  unlink(join(UPLOADS_DIR, photo.filename), () => {});
}
