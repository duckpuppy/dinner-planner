import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  query: {},
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn().mockReturnValue(null) }));
vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    appSettings: { id: null, weekStartDay: null, recencyWindowDays: null, updatedAt: null },
  },
}));

import { getSettings, updateSettings } from '../services/settings.js';

function selFromLimit(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(result) }) };
}

function updSetWhereReturning(result: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

const mockSettings = {
  id: 'default',
  weekStartDay: 0,
  recencyWindowDays: 30,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSettings', () => {
  it('returns settings when found', async () => {
    mockDb.select.mockReturnValueOnce(selFromLimit([mockSettings]));
    const result = await getSettings();
    expect(result).toEqual(mockSettings);
  });

  it('throws when no settings row exists', async () => {
    mockDb.select.mockReturnValueOnce(selFromLimit([]));
    await expect(getSettings()).rejects.toThrow('Settings not found');
  });
});

describe('updateSettings', () => {
  it('updates and returns new settings', async () => {
    const updated = { ...mockSettings, weekStartDay: 1 };
    mockDb.select.mockReturnValueOnce(selFromLimit([mockSettings])); // getSettings inside
    mockDb.update.mockReturnValueOnce(updSetWhereReturning([updated]));

    const result = await updateSettings({ weekStartDay: 1 });
    expect(result).toEqual(updated);
  });

  it('updates recencyWindowDays', async () => {
    const updated = { ...mockSettings, recencyWindowDays: 14 };
    mockDb.select.mockReturnValueOnce(selFromLimit([mockSettings]));
    mockDb.update.mockReturnValueOnce(updSetWhereReturning([updated]));

    const result = await updateSettings({ recencyWindowDays: 14 });
    expect(result).toEqual(updated);
  });
});
