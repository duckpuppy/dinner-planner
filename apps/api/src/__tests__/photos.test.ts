/**
 * Unit tests for photos service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  query: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  sql: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
}));

// Mock filesystem so tests don't touch disk
vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  })),
  unlink: vi.fn((_path, cb) => cb && cb()),
}));

vi.mock('stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
  };
});

import { getPhotosForPreparation, uploadPhoto, deletePhoto } from '../services/photos.js';
import * as streamPromises from 'stream/promises';
import * as fs from 'fs';

function selWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
}

// select().from().innerJoin().innerJoin().where().limit() — preparationFamilyId
function selFamilyCheck(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

const FAMILY_ID = 'family-1';

function mockFamilyCheck() {
  mockDb.select.mockReturnValueOnce(selFamilyCheck([{ familyId: FAMILY_ID }]));
}

function makeInsertReturning(result: unknown) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([result]),
    }),
  };
}

function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

const mockPhoto = {
  id: 'photo-1',
  preparationId: 'prep-1',
  uploadedById: 'user-1',
  filename: 'abc.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  createdAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.delete.mockReturnValue(makeDelete());
  vi.mocked(streamPromises.pipeline).mockResolvedValue(undefined);
});

describe('getPhotosForPreparation', () => {
  it('returns photos with url for a preparation', async () => {
    mockFamilyCheck();
    mockDb.select.mockReturnValueOnce(selWhere([mockPhoto]));

    const result = await getPhotosForPreparation('prep-1', FAMILY_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('photo-1');
    expect(result[0].url).toBe('/uploads/abc.jpg');
  });

  it('returns empty array when no photos', async () => {
    mockFamilyCheck();
    mockDb.select.mockReturnValueOnce(selWhere([]));

    const result = await getPhotosForPreparation('prep-1', FAMILY_ID);

    expect(result).toHaveLength(0);
  });

  it('returns empty array when preparation belongs to another family', async () => {
    mockDb.select.mockReturnValueOnce(selFamilyCheck([]));

    const result = await getPhotosForPreparation('prep-1', FAMILY_ID);

    expect(result).toEqual([]);
  });
});

describe('uploadPhoto', () => {
  function makeFile(overrides: Partial<{ filename: string; mimetype: string }> = {}) {
    const readable = new Readable({ read() {} });
    readable.push(null);
    return {
      filename: 'test.jpg',
      mimetype: 'image/jpeg',
      file: readable as NodeJS.ReadableStream,
      ...overrides,
    };
  }

  it('throws 404 when preparation not found', async () => {
    mockDb.select.mockReturnValueOnce(selFamilyCheck([])); // preparationFamilyId → null

    await expect(uploadPhoto('prep-1', 'user-1', makeFile(), FAMILY_ID)).rejects.toMatchObject({
      message: 'Preparation not found',
      statusCode: 404,
    });
  });

  it('throws 400 for disallowed mime type', async () => {
    mockFamilyCheck();

    await expect(
      uploadPhoto('prep-1', 'user-1', makeFile({ mimetype: 'text/plain' }), FAMILY_ID)
    ).rejects.toMatchObject({
      message: 'Only JPEG, PNG, WebP and GIF images are allowed',
      statusCode: 400,
    });
  });

  it('uploads file and inserts DB record on success', async () => {
    mockFamilyCheck();
    mockDb.insert.mockReturnValueOnce(makeInsertReturning(mockPhoto));

    const result = await uploadPhoto('prep-1', 'user-1', makeFile(), FAMILY_ID);

    expect(result.id).toBe('photo-1');
    expect(result.url).toBe('/uploads/abc.jpg');
  });

  it('cleans up file and rethrows when pipeline fails', async () => {
    const pipelineError = new Error('Write error');
    vi.mocked(streamPromises.pipeline).mockRejectedValueOnce(pipelineError);

    mockFamilyCheck();

    await expect(uploadPhoto('prep-1', 'user-1', makeFile(), FAMILY_ID)).rejects.toThrow(
      'Write error'
    );
    expect(fs.unlink).toHaveBeenCalled();
  });

  it('accepts png mime type', async () => {
    mockFamilyCheck();
    mockDb.insert.mockReturnValueOnce(
      makeInsertReturning({ ...mockPhoto, mimeType: 'image/png', filename: 'test.png' })
    );

    const result = await uploadPhoto(
      'prep-1',
      'user-1',
      makeFile({ mimetype: 'image/png' }),
      FAMILY_ID
    );
    expect(result.url).toMatch(/\/uploads\//);
  });

  it('accepts gif mime type', async () => {
    mockFamilyCheck();
    mockDb.insert.mockReturnValueOnce(
      makeInsertReturning({ ...mockPhoto, mimeType: 'image/gif', filename: 'test.gif' })
    );

    const result = await uploadPhoto(
      'prep-1',
      'user-1',
      makeFile({ mimetype: 'image/gif' }),
      FAMILY_ID
    );
    expect(result.url).toMatch(/\/uploads\//);
  });

  it('derives extension from mimetype when filename has no extension', async () => {
    mockFamilyCheck();
    mockDb.insert.mockReturnValueOnce(makeInsertReturning(mockPhoto));

    const result = await uploadPhoto(
      'prep-1',
      'user-1',
      makeFile({ filename: 'photo', mimetype: 'image/png' }),
      FAMILY_ID
    );
    expect(result).toBeDefined();
  });
});

describe('deletePhoto', () => {
  it('throws 404 when photo not found', async () => {
    mockDb.select.mockReturnValueOnce(selWhere([]));

    await expect(deletePhoto('photo-1', 'user-1', false, FAMILY_ID)).rejects.toMatchObject({
      message: 'Photo not found',
      statusCode: 404,
    });
  });

  it('throws 404 when photo belongs to a preparation in another family', async () => {
    mockDb.select.mockReturnValueOnce(selWhere([mockPhoto]));
    mockDb.select.mockReturnValueOnce(selFamilyCheck([])); // preparationFamilyId → null

    await expect(deletePhoto('photo-1', 'user-1', false, FAMILY_ID)).rejects.toMatchObject({
      message: 'Photo not found',
      statusCode: 404,
    });
  });

  it('throws 403 when non-owner non-admin tries to delete', async () => {
    mockDb.select.mockReturnValueOnce(selWhere([mockPhoto]));
    mockFamilyCheck();

    await expect(deletePhoto('photo-1', 'other-user', false, FAMILY_ID)).rejects.toMatchObject({
      message: 'Forbidden',
      statusCode: 403,
    });
  });

  it('deletes photo record and file when owner requests delete', async () => {
    mockDb.select.mockReturnValueOnce(selWhere([mockPhoto]));
    mockFamilyCheck();

    await deletePhoto('photo-1', 'user-1', false, FAMILY_ID);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalled();
  });

  it('deletes photo record and file when admin requests delete', async () => {
    mockDb.select.mockReturnValueOnce(selWhere([{ ...mockPhoto, uploadedById: 'other-user' }]));
    mockFamilyCheck();

    await deletePhoto('photo-1', 'admin-user', true, FAMILY_ID);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalled();
  });
});
