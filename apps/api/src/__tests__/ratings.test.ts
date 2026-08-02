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
    dishes: { findFirst: vi.fn() },
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
    preparations: { id: null, dishId: null, dinnerEntryId: null },
    dinnerEntries: { id: null, menuId: null },
    weeklyMenus: { id: null, familyId: null },
    dishes: { id: null, familyId: null },
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

const FAMILY_ID = 'family-1';

function selWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

// select().from().innerJoin().innerJoin().where().limit() — preparationFamilyId check
function selFromInnerJoinInnerJoinWhereLimit(result: unknown[]) {
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

function mockFamilyCheck() {
  mockDb.select.mockReturnValueOnce(selFromInnerJoinInnerJoinWhereLimit([{ familyId: FAMILY_ID }]));
}

function mockFamilyCheckMiss() {
  mockDb.select.mockReturnValueOnce(selFromInnerJoinInnerJoinWhereLimit([]));
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
const mockDish = { id: 'dish-1', familyId: FAMILY_ID };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRatingsForPreparation', () => {
  it('returns empty array when preparation belongs to another family', async () => {
    mockFamilyCheckMiss();
    const result = await getRatingsForPreparation('prep-1', FAMILY_ID);
    expect(result).toEqual([]);
  });

  it('returns empty array when no ratings', async () => {
    mockFamilyCheck();
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([]));
    const result = await getRatingsForPreparation('prep-1', FAMILY_ID);
    expect(result).toEqual([]);
  });

  it('returns enriched ratings with user names', async () => {
    mockFamilyCheck();
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([mockRating]));
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await getRatingsForPreparation('prep-1', FAMILY_ID);
    expect(result).toHaveLength(1);
    expect(result[0].userName).toBe('Alice');
    expect(result[0].stars).toBe(4);
  });

  it('uses "Unknown" when user not found', async () => {
    mockFamilyCheck();
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([mockRating]));
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);

    const result = await getRatingsForPreparation('prep-1', FAMILY_ID);
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
  it('throws when preparation belongs to another family', async () => {
    mockFamilyCheckMiss();
    await expect(createRating('prep-1', 'user-1', { stars: 5 }, FAMILY_ID)).rejects.toThrow(
      'Preparation not found'
    );
  });

  it('throws when user already rated this preparation', async () => {
    mockFamilyCheck();
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // existing check
    await expect(createRating('prep-1', 'user-1', { stars: 5 }, FAMILY_ID)).rejects.toThrow(
      'You have already rated this preparation'
    );
  });

  it('creates and returns rating on success', async () => {
    mockFamilyCheck();
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null); // no existing
    mockDb.insert.mockReturnValueOnce(ins());
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // post-insert
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await createRating('prep-1', 'user-1', { stars: 4, note: 'Good' }, FAMILY_ID);
    expect(result.stars).toBe(4);
    expect(result.userName).toBe('Alice');
  });
});

describe('updateRating', () => {
  it('returns null when rating not found', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null);
    const result = await updateRating('rating-1', 'user-1', { stars: 5 }, FAMILY_ID);
    expect(result).toBeNull();
  });

  it('returns null when preparation belongs to another family', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating);
    mockFamilyCheckMiss();
    const result = await updateRating('rating-1', 'user-1', { stars: 5 }, FAMILY_ID);
    expect(result).toBeNull();
  });

  it('throws when user is not the owner', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // owned by user-1
    mockFamilyCheck();
    await expect(
      updateRating('rating-1', 'user-2', { stars: 5 }, FAMILY_ID) // different user
    ).rejects.toThrow('You can only edit your own ratings');
  });

  it('updates and returns rating on success', async () => {
    const updated = { ...mockRating, stars: 5 };
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating);
    mockFamilyCheck();
    mockDb.update.mockReturnValueOnce(updSetWhere());
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(updated);
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);

    const result = await updateRating('rating-1', 'user-1', { stars: 5 }, FAMILY_ID);
    expect(result!.stars).toBe(5);
  });
});

describe('deleteRating', () => {
  it('returns error when rating not found', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(null);
    const result = await deleteRating('rating-1', 'user-1', false, FAMILY_ID);
    expect(result).toEqual({ success: false, error: 'Rating not found' });
  });

  it('returns error when preparation belongs to another family', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating);
    mockFamilyCheckMiss();
    const result = await deleteRating('rating-1', 'user-1', false, FAMILY_ID);
    expect(result).toEqual({ success: false, error: 'Rating not found' });
  });

  it('returns error when user is not owner and not admin', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // owned by user-1
    mockFamilyCheck();
    const result = await deleteRating('rating-1', 'user-2', false, FAMILY_ID);
    expect(result).toEqual({ success: false, error: 'You can only delete your own ratings' });
  });

  it('allows owner to delete their rating', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating);
    mockFamilyCheck();
    mockDb.delete.mockReturnValueOnce(del());
    const result = await deleteRating('rating-1', 'user-1', false, FAMILY_ID);
    expect(result).toEqual({ success: true });
  });

  it('allows admin to delete any rating', async () => {
    mockDb.query.ratings.findFirst.mockResolvedValueOnce(mockRating); // owned by user-1
    mockFamilyCheck();
    mockDb.delete.mockReturnValueOnce(del());
    const result = await deleteRating('rating-1', 'user-2', true, FAMILY_ID); // user-2 is admin
    expect(result).toEqual({ success: true });
  });
});

describe('getDishRatingStats', () => {
  it('returns zeroed stats when dish belongs to another family', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(null);
    const result = await getDishRatingStats('dish-1', FAMILY_ID);
    expect(result).toEqual({ averageRating: null, totalRatings: 0 });
  });

  it('returns null averageRating when dish has no preparations', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(mockDish);
    mockDb.select.mockReturnValueOnce(selFromWhere([]));
    const result = await getDishRatingStats('dish-1', FAMILY_ID);
    expect(result).toEqual({ averageRating: null, totalRatings: 0 });
  });

  it('returns null averageRating when preparations have no ratings', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(mockDish);
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'prep-1' }]));
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no ratings for prep
    const result = await getDishRatingStats('dish-1', FAMILY_ID);
    expect(result).toEqual({ averageRating: null, totalRatings: 0 });
  });

  it('calculates average rating correctly', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(mockDish);
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'prep-1' }, { id: 'prep-2' }]));
    mockDb.select.mockReturnValueOnce(selFromWhere([{ stars: 4 }, { stars: 5 }])); // prep-1 ratings
    mockDb.select.mockReturnValueOnce(selFromWhere([{ stars: 3 }])); // prep-2 ratings

    const result = await getDishRatingStats('dish-1', FAMILY_ID);
    // average of [4, 5, 3] = 4.0
    expect(result.averageRating).toBe(4);
    expect(result.totalRatings).toBe(3);
  });

  it('rounds average to one decimal place', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(mockDish);
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'prep-1' }]));
    mockDb.select.mockReturnValueOnce(selFromWhere([{ stars: 4 }, { stars: 3 }]));

    const result = await getDishRatingStats('dish-1', FAMILY_ID);
    // average of [4, 3] = 3.5
    expect(result.averageRating).toBe(3.5);
    expect(result.totalRatings).toBe(2);
  });
});
