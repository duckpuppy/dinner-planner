import type { DishNote } from '@dinner-planner/shared';
export { DIETARY_TAGS } from '@dinner-planner/shared';
export type { DietaryTag } from '@dinner-planner/shared';

const API_BASE = '/api';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 by trying to refresh
  if (response.status === 401 && !path.includes('/auth/')) {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      const retryResponse = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
        throw new ApiError(retryResponse.status, error.error || 'Request failed', error.details);
      }

      return retryResponse.json();
    } else {
      // Refresh failed, clear token and throw error
      // Let the auth store handle logout via React Router
      accessToken = null;
      throw new ApiError(401, 'Session expired');
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(response.status, error.error || 'Request failed', error.details);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

async function requestFormData<T>(path: string, body: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body,
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(response.status, error.error || 'Request failed');
  }
  return response.json();
}

async function refreshToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

// API Token types
export interface ApiTokenRow {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// Auth API
export const auth = {
  login: (username: string, password: string) =>
    request<{ user: User; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  refresh: () =>
    request<{ user: User; accessToken: string }>('/auth/refresh', {
      method: 'POST',
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),

  me: () => request<{ user: User }>('/auth/me'),
};

// API Tokens API
export const apiTokens = {
  list: () => request<{ tokens: ApiTokenRow[] }>('/auth/tokens'),
  create: (body: { name: string; expiresAt?: string }) =>
    request<{ id: string; name: string; token: string; expiresAt: string | null }>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revoke: (id: string) => request<{ success: boolean }>(`/auth/tokens/${id}`, { method: 'DELETE' }),
};

// Users API
export const users = {
  list: () => request<{ users: User[] }>('/users'),

  get: (id: string) => request<{ user: User }>(`/users/${id}`),

  create: (data: {
    username: string;
    displayName: string;
    password: string;
    role: 'admin' | 'member';
  }) =>
    request<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { displayName?: string; role?: 'admin' | 'member' }) =>
    request<{ user: User }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updatePreferences: (
    id: string,
    data: { theme?: 'light' | 'dark'; homeView?: 'today' | 'week'; dietaryPreferences?: string[] }
  ) =>
    request<{ user: User }>(`/users/${id}/preferences`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  changePassword: (id: string, currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>(`/users/${id}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  resetPassword: (id: string, newPassword: string) =>
    request<{ success: boolean }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  delete: (id: string) => request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),
};

// Dishes API
export const dishes = {
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return request<{ dishes: Dish[]; total: number }>(`/dishes${query}`);
  },

  get: (id: string) => request<{ dish: Dish }>(`/dishes/${id}`),

  create: (data: CreateDishData) =>
    request<{ dish: Dish }>('/dishes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateDishData>) =>
    request<{ dish: Dish }>(`/dishes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  archive: (id: string) => request<{ dish: Dish }>(`/dishes/${id}/archive`, { method: 'POST' }),

  unarchive: (id: string) => request<{ dish: Dish }>(`/dishes/${id}/unarchive`, { method: 'POST' }),

  getPreparations: (id: string) =>
    request<{ preparations: Preparation[] }>(`/dishes/${id}/preparations`),

  hardDelete: (id: string) => request<{ success: boolean }>(`/dishes/${id}`, { method: 'DELETE' }),

  importFromUrl: (url: string) =>
    request<{ recipe: CreateDishData }>('/dishes/import-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  importVideoUrl: (url: string) =>
    request<{ jobId: string }>('/dishes/import-video-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  getVideoJob: (jobId: string) => request<{ job: VideoJob }>(`/jobs/${jobId}`),

  deleteVideo: (id: string) =>
    request<{ success: boolean }>(`/dishes/${id}/video`, { method: 'DELETE' }),
};

// Menus API
export const menus = {
  getWeek: (date: string) => request<{ menu: WeeklyMenu }>(`/menus/week/${date}`),

  getGroceries: (date: string) =>
    request<{
      groceries: GroceryItem[];
      customItems: CustomGroceryItem[];
      standingItems: StandingItem[];
      weekStartDate: string;
      checkedKeys: string[];
    }>(`/menus/week/${date}/groceries`),

  toggleGroceryCheck: (weekDate: string, itemKey: string, itemName: string) =>
    request<{ itemKey: string; checked: boolean }>('/grocery/checks/toggle', {
      method: 'POST',
      body: JSON.stringify({ weekDate, itemKey, itemName }),
    }),

  clearGroceryChecks: (weekDate: string) =>
    request<void>(`/grocery/checks?weekDate=${encodeURIComponent(weekDate)}`, {
      method: 'DELETE',
    }),

  addCustomItem: (
    weekDate: string,
    data: { name: string; quantity?: number; unit?: string; storeId?: string | null }
  ) =>
    request<{ item: CustomGroceryItem }>('/grocery/custom', {
      method: 'POST',
      body: JSON.stringify({ weekDate, ...data }),
    }).then((res) => res.item),

  deleteCustomItem: (id: string) => request<void>(`/grocery/custom/${id}`, { method: 'DELETE' }),

  updateCustomItem: (
    id: string,
    data: { name?: string; quantity?: number | null; unit?: string | null; storeId?: string | null }
  ) =>
    request<{ item: CustomGroceryItem }>(`/grocery/custom/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then((res) => res.item),

  getToday: () => request<{ entry: DinnerEntry }>('/menus/today'),

  updateEntry: (id: string, data: UpdateEntryData) =>
    request<{ entry: DinnerEntry }>(`/entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  markCompleted: (id: string, completed: boolean) =>
    request<{ entry: DinnerEntry }>(`/entries/${id}/completed`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),

  skipEntry: (id: string, skipped: boolean) =>
    request<{ entry: DinnerEntry }>(`/entries/${id}/skip`, {
      method: 'PATCH',
      body: JSON.stringify({ skipped }),
    }),

  recentCompleted: async (): Promise<{ id: string; date: string; mainDishName: string }[]> => {
    const data = await request<{
      entries: { id: string; date: string; mainDishName: string }[];
    }>('/entries/recent-completed');
    return data.entries;
  },
};

// Preparations API
export const preparations = {
  create: (data: {
    dinnerEntryId: string;
    dishId: string;
    preparerIds: string[];
    notes?: string | null;
  }) =>
    request<{ preparation: Preparation }>('/preparations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ success: boolean }>(`/preparations/${id}`, { method: 'DELETE' }),
};

// Photos API
export const photos = {
  list: (preparationId: string) =>
    request<{ photos: Photo[] }>(`/preparations/${preparationId}/photos`),

  upload: (preparationId: string, file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return requestFormData<{ photo: Photo }>(`/preparations/${preparationId}/photos`, form);
  },

  delete: (photoId: string) =>
    request<{ success: boolean }>(`/photos/${photoId}`, { method: 'DELETE' }),
};

// Ratings API
export const ratings = {
  getForPreparation: (preparationId: string) =>
    request<{ ratings: Rating[] }>(`/preparations/${preparationId}/ratings`),

  create: (preparationId: string, data: { stars: number; note?: string }) =>
    request<{ rating: Rating }>(`/preparations/${preparationId}/ratings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (ratingId: string, data: { stars?: number; note?: string }) =>
    request<{ rating: Rating }>(`/ratings/${ratingId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (ratingId: string) =>
    request<{ success: boolean }>(`/ratings/${ratingId}`, { method: 'DELETE' }),

  getDishStats: (dishId: string) =>
    request<{ stats: DishRatingStats }>(`/dishes/${dishId}/rating-stats`),
};

// History API
export const history = {
  list: (params?: {
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = params
      ? `?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )}`
      : '';
    return request<{ entries: HistoryEntry[]; total: number }>(`/history${query}`);
  },

  getDishHistory: (dishId: string) =>
    request<{ preparations: DishPreparationHistory[] }>(`/dishes/${dishId}/history`),

  delete: (entryId: string) =>
    request<{ success: boolean }>(`/history/${entryId}`, { method: 'DELETE' }),
};

// Settings API
export const settings = {
  get: () => request<{ settings: AppSettings }>('/settings'),

  update: (data: {
    weekStartDay?: number;
    recencyWindowDays?: number;
    ollamaUrl?: string | null;
    ollamaModel?: string;
    llmMode?: 'disabled' | 'direct' | 'n8n';
    n8nWebhookUrl?: string | null;
    videoStorageLimitMb?: number;
  }) =>
    request<{ settings: AppSettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getOllamaStatus: () =>
    request<{ available: boolean; url: string | null }>('/settings/ollama-status'),

  testOllamaConnection: (url: string, model?: string) =>
    request<{ available: boolean; modelFound: boolean | null }>('/settings/test-ollama', {
      method: 'POST',
      body: JSON.stringify({ url, model }),
    }),
};

// Stores API
export const stores = {
  list: () => request<{ stores: Store[] }>('/stores').then((res) => res.stores),
};

// Standing Items API
export const standing = {
  list: () => request<StandingItem[]>('/grocery/standing'),
  add: (data: {
    name: string;
    quantity?: number | null;
    unit?: string | null;
    category?: string;
    storeId?: string | null;
  }) =>
    request<StandingItem>('/grocery/standing', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/grocery/standing/${id}`, { method: 'DELETE' }),
};

export const suggestions = {
  list: (params?: { tag?: string; limit?: number; exclude?: string[]; dietaryTags?: string[] }) => {
    const query = new URLSearchParams();
    if (params?.tag) query.set('tag', params.tag);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.exclude?.length) {
      params.exclude.forEach((id) => query.append('exclude', id));
    }
    if (params?.dietaryTags?.length) {
      params.dietaryTags.forEach((tag) => query.append('dietaryTags', tag));
    }
    const qs = query.toString();
    return request<{ suggestions: SuggestedDish[] }>(`/dishes/suggestions${qs ? `?${qs}` : ''}`);
  },
};

// Patterns API
export const patterns = {
  list: () => request<{ patterns: Pattern[] }>('/patterns'),

  get: (id: string) => request<{ pattern: Pattern }>(`/patterns/${id}`),

  create: (data: {
    label: string;
    dayOfWeek: number;
    type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom';
    mainDishId?: string | null;
    sideDishIds?: string[];
    customText?: string | null;
  }) =>
    request<{ pattern: Pattern }>('/patterns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: Partial<{
      label: string;
      dayOfWeek: number;
      type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom';
      mainDishId: string | null;
      sideDishIds: string[];
      customText: string | null;
    }>
  ) =>
    request<{ pattern: Pattern }>(`/patterns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<{ success: boolean }>(`/patterns/${id}`, { method: 'DELETE' }),

  applyToWeek: (date: string) =>
    request<{ applied: number; menu: WeeklyMenu }>(`/menus/week/${date}/apply-patterns`, {
      method: 'POST',
    }),
};

// Types
export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  theme: 'light' | 'dark';
  homeView: 'today' | 'week';
  dietaryPreferences: string[];
}

export interface Dish {
  id: string;
  name: string;
  description: string;
  type: 'main' | 'side' | 'both';
  instructions: string;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sourceUrl: string | null;
  videoUrl: string | null;
  localVideoFilename: string | null;
  videoThumbnailFilename: string | null;
  videoSize: number | null;
  videoDuration: number | null;
  archived: boolean;
  createdById: string;
  ingredients: Ingredient[];
  tags: string[];
  dietaryTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Ingredient {
  id: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  sortOrder: number;
  category: string;
  stores: string[];
}

export interface CreateDishData {
  name: string;
  description?: string;
  type: 'main' | 'side' | 'both';
  instructions?: string;
  prepTime?: number | null;
  cookTime?: number | null;
  servings?: number | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  sourceUrl?: string | null;
  videoUrl?: string | null;
  ingredients?: Array<{
    quantity: number | null;
    unit: string | null;
    name: string;
    notes: string | null;
    category?: string;
    storeIds?: string[];
  }>;
  tags?: string[];
  dietaryTags?: string[];
}

export interface WeeklyMenu {
  id: string;
  weekStartDate: string;
  entries: DinnerEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DinnerEntry {
  id: string;
  date: string;
  dayOfWeek: number;
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';
  customText: string | null;
  customSideText: string | null;
  restaurantName: string | null;
  restaurantNotes: string | null;
  completed: boolean;
  skipped: boolean;
  scale: number;
  sourceEntryId: string | null;
  sourceEntryDishName: string | null;
  mainDish: { id: string; name: string; type: string } | null;
  sideDishes: { id: string; name: string; type: string }[];
  preparations: Preparation[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateEntryData {
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';
  customText?: string | null;
  customSideText?: string | null;
  restaurantName?: string | null;
  restaurantNotes?: string | null;
  mainDishId?: string | null;
  sideDishIds?: string[];
  sourceEntryId?: string | null;
  scale?: number;
}

export interface Preparation {
  id: string;
  dishId: string;
  dishName: string;
  preparers: { id: string; name: string }[];
  preparedDate: string;
  notes: string | null;
  createdAt: string;
}

export interface Photo {
  id: string;
  preparationId: string;
  uploadedById: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface Rating {
  id: string;
  preparationId: string;
  userId: string;
  userName: string;
  stars: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DishRatingStats {
  averageRating: number | null;
  totalRatings: number;
}

export interface HistoryEntry {
  id: string;
  date: string;
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';
  customText: string | null;
  completed: boolean;
  sourceEntryId: string | null;
  sourceEntryDishName: string | null;
  mainDish: { id: string; name: string } | null;
  sideDishes: { id: string; name: string }[];
  preparations: {
    id: string;
    preparers: { id: string; name: string }[];
    notes: string | null;
    ratings: { id: string; stars: number; userName: string }[];
  }[];
}

export interface DishPreparationHistory {
  id: string;
  date: string;
  preparers: { id: string; name: string }[];
  notes: string | null;
  ratings: {
    id: string;
    stars: number;
    note: string | null;
    userName: string;
  }[];
}

export interface AppSettings {
  id: string;
  weekStartDay: number;
  recencyWindowDays: number;
  ollamaUrl: string | null;
  ollamaModel: string;
  llmMode: 'disabled' | 'direct' | 'n8n';
  n8nWebhookUrl: string | null;
  videoStorageLimitMb: number;
  createdAt: string;
  updatedAt: string;
}

export interface VideoJob {
  id: string;
  dishId: string | null;
  sourceUrl: string;
  status: 'pending' | 'downloading' | 'extracting' | 'complete' | 'failed';
  progress: number;
  resultVideoFilename: string | null;
  resultMetadata: Record<string, unknown> | null;
  extractedRecipe: CreateDishData | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  dishes: string[];
  notes: string[];
  inPantry: boolean;
  category: string;
  stores: string[];
}

export interface CustomGroceryItem {
  id: string;
  weekDate: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sortOrder: number;
  storeId: string | null;
  storeName: string | null;
}

export interface Store {
  id: string;
  name: string;
}

export interface StandingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  storeId: string | null;
  storeName: string | null;
}

export interface PantryItem {
  id: string;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface SuggestedDish {
  id: string;
  name: string;
  type: 'main' | 'side' | 'both';
  description: string;
  tags: string[];
  avgRating: number | null;
  totalRatings: number;
  lastPreparedDate: string | null;
  score: number;
  reasons: string[];
}

export interface Pattern {
  id: string;
  label: string;
  dayOfWeek: number;
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom';
  mainDishId: string | null;
  mainDish: { id: string; name: string; type: 'main' | 'side' } | null;
  sideDishIds: string[];
  sideDishes: { id: string; name: string; type: 'main' | 'side' }[];
  customText: string | null;
  createdById: string;
  createdAt: string;
}

export type { DishNote };

export interface PrepTask {
  id: string;
  entryId: string;
  description: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Dish Notes API
export const dishNotes = {
  list: (dishId: string) => request<{ notes: DishNote[] }>(`/dishes/${dishId}/notes`),

  create: (dishId: string, note: string) =>
    request<{ note: DishNote }>(`/dishes/${dishId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  delete: (id: string) => request<Record<string, never>>(`/dish-notes/${id}`, { method: 'DELETE' }),
};

// Pantry API
export const pantry = {
  list: () => request<{ items: PantryItem[] }>('/pantry'),

  create: (data: {
    ingredientName: string;
    quantity?: number | null;
    unit?: string | null;
    expiresAt?: string | null;
  }) =>
    request<{ item: PantryItem }>('/pantry', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: Partial<{
      ingredientName: string;
      quantity: number | null;
      unit: string | null;
      expiresAt: string | null;
    }>
  ) =>
    request<{ item: PantryItem }>(`/pantry/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<Record<string, never>>(`/pantry/${id}`, { method: 'DELETE' }),
};

// Health / Setup API
export async function getHealth(): Promise<{ status: string; setupRequired: boolean }> {
  const response = await fetch('/health');
  if (!response.ok) throw new Error('Health check failed');
  return response.json();
}

export async function postSetup(username: string, password: string): Promise<void> {
  const response = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 404) throw new Error('already_complete');
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error('setup_failed'), { details: data });
  }
}

// Prep Tasks API
export const prepTasks = {
  list: (entryId: string) => request<{ prepTasks: PrepTask[] }>(`/entries/${entryId}/prep-tasks`),

  create: (entryId: string, description: string) =>
    request<PrepTask>(`/entries/${entryId}/prep-tasks`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),

  update: (id: string, data: { description?: string; completed?: boolean }) =>
    request<PrepTask>(`/prep-tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<Record<string, never>>(`/prep-tasks/${id}`, { method: 'DELETE' }),
};
