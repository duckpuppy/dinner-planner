import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    users: { findFirst: vi.fn() },
    ratings: { findFirst: vi.fn() },
    preparations: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    ratings: {
      id: null,
      preparationId: null,
      userId: null,
      stars: null,
      createdAt: null,
    },
    users: { id: null, displayName: null },
    preparations: { id: null, dishId: null },
  },
}));

import {
  getRatingsForPreparation,
  getUserRatingForPreparation,
  createRating,
  updateRating,
  deleteRating,
  getDishRatingStats,
} from '../services/ratings.js';

function selWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function ins() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function updSetWhere() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

function del() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

function selFromWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

const mockUser = { id: 'user-1', displayName: 'Alice' };
const mockRating = {
  id: 'rating-1',
  preparationId: 'prep-1',
  userId: 'user-1',
  stars: 4,
  note: 'Good',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};
const mockPrep = { id: 'prep-1', dishId: 'dish-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRatingsForPreparation', () => {
  it('returns empty array when no ratings', async () => {
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([]));
    const result = await getRatingsForPreparation('prep-1');
    expect(result).toEqual([]);
  });

  it('returns enriched ratings with user names', async () => {
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([mockRating]));
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await getRatingsForPreparation('prep-1');
    expect(result).toHaveLength(1);
    expect(result[0].userName).toBe('Alice');
    expect(result[0].stars).toBe(4);
  });

  it('uses "Unknown" when user not found', async () => {
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([mockRating]));
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);

    const result = await getRatingsForPreparation('prep-1');
    expect(result[0].userName).toBe('Unknown');
  });
});

describe('getUserRatingForPreparation', () => {
  it('returns null when not found', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null);
    const result = await getUserRatingForPreparation('prep-1', 'user-1');
    expect(result).toBeNull();
  });

  it('returns rating when found', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating);
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await getUserRatingForPreparation('prep-1', 'user-1');
    expect(result!.id).toBe('rating-1');
    expect(result!.userName).toBe('Alice');
  });
});

describe('createRating', () => {
  it('throws when user already rated this preparation', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // existing check
    await expect(createRating('prep-1', 'user-1', { stars: 5 })).rejects.toThrow(
      'You have already rated this preparation'
    );
  });

  it('throws when preparation not found', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null); // no existing
    mockDb.query.preparations.findFirst.mockResolvedValueOnce(null); // prep not found
    await expect(createRating('prep-1', 'user-1', { stars: 5 })).rejects.toThrow(
      'Preparation not found'
    );
  });

  it('creates and returns rating on success', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null); // no existing
    mockDb.query.preparations.findFirst.mockResolvedValueOnce(mockPrep);
    mockDb.insert.mockReturnValueOnce(ins());
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // post-insert
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await createRating('prep-1', 'user-1', { stars: 4, note: 'Good' });
    expect(result.stars).toBe(4);
    expect(result.userName).toBe('Alice');
  });
});

describe('updateRating', () => {
  it('returns null when rating not found', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null);
    const result = await updateRating('rating-1', 'user-1', { stars: 5 });
    expect(result).toBeNull();
  });

  it('throws when user is not the owner', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // owned by user-1
    await expect(
      updateRating('rating-1', 'user-2', { stars: 5 }) // different user
    ).rejects.toThrow('You can only edit your own ratings');
  });

  it('updates and returns rating on success', async () => {
    const updated = { ...mockRating, stars: 5 };
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating);
    mockDb.update.mockReturnValueOnce(updSetWhere());
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(updated);
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await updateRating('rating-1', 'user-1', { stars: 5 });
    expect(result!.stars).toBe(5);
  });
});

describe('deleteRating', () => {
  it('returns error when rating not found', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null);
    const result = await deleteRating('rating-1', 'user-1', false);
    expect(result).toEqual({ success: false, error: 'Rating not found' });
  });

  it('returns error when user is not owner and not admin', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // owned by user-1
    const result = await deleteRating('rating-1', 'user-2', false);
    expect(result).toEqual({ success: false, error: 'You can only delete your own ratings' });
  });

  it('allows owner to delete their rating', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating);
    mockDb.delete.mockReturnValueOnce(del());
    const result = await deleteRating('rating-1', 'user-1', false);
    expect(result).toEqual({ success: true });
  });

  it('allows admin to delete any rating', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // owned by user-1
    mockDb.delete.mockReturnValueOnce(del());
    const result = await deleteRating('rating-1', 'user-2', true); // user-2 is admin
    expect(result).toEqual({ success: true });
  });
});

describe('getDishRatingStats', () => {
  it('returns null averageRating when dish has no preparations', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([]));
    const result = await getDishRatingStats('dish-1');
    expect(result).toEqual({ averageRating: null, totalRatings: 0 });
  });

  it('returns null averageRating when preparations have no ratings', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'prep-1' }]));
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no ratings for prep
    const result = await getDishRatingStats('dish-1');
    expect(result).toEqual({ averageRating: null, totalRatings: 0 });
  });

  it('calculates average rating correctly', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'prep-1' }, { id: 'prep-2' }]));
    mockDb.select.mockReturnValueOnce(selFromWhere([{ stars: 4 }, { stars: 5 }])); // prep-1 ratings
    mockDb.select.mockReturnValueOnce(selFromWhere([{ stars: 3 }])); // prep-2 ratings

    const result = await getDishRatingStats('dish-1');
    // average of [4, 5, 3] = 4.0
    expect(result.averageRating).toBe(4);
    expect(result.totalRatings).toBe(3);
  });

  it('rounds average to one decimal place', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'prep-1' }]));
    mockDb.select.mockReturnValueOnce(selFromWhere([{ stars: 4 }, { stars: 3 }]));

    const result = await getDishRatingStats('dish-1');
    // average of [4, 3] = 3.5
    expect(result.averageRating).toBe(3.5);
    expect(result.totalRatings).toBe(2);
  });
});
