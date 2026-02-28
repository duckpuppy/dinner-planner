// User types
export type UserRole = 'admin' | 'member';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  homeView: 'today' | 'week';
}

// Dish types
export type DishType = 'main' | 'side';

export interface Ingredient {
  id: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  category: string;
  stores: string[];
}

export interface Dish {
  id: string;
  name: string;
  description: string;
  type: DishType;
  ingredients: Ingredient[];
  instructions: string;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  sourceUrl: string | null;
  videoUrl: string | null;
  tags: string[];
  archived: boolean;
  aggregateRating: number | null;
  preparationCount: number;
  lastPreparedAt: string | null;
  createdBy: Pick<User, 'id' | 'displayName'>;
  createdAt: string;
  updatedAt: string;
}

export type DishSummary = Pick<
  Dish,
  'id' | 'name' | 'type' | 'tags' | 'aggregateRating' | 'preparationCount' | 'lastPreparedAt'
>;

// Menu types
export type DinnerType = 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';

export interface DinnerEntry {
  id: string;
  date: string;
  type: DinnerType;
  customText: string | null;
  mainDish: DishSummary | null;
  sideDishes: DishSummary[];
  completed: boolean;
  preparation: PreparationSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyMenu {
  id: string;
  weekStartDate: string;
  entries: DinnerEntry[];
}

// Preparation types
export interface Preparation {
  id: string;
  dish: DishSummary;
  dinnerEntry: Pick<DinnerEntry, 'id' | 'date'>;
  preparedBy: Pick<User, 'id' | 'displayName'>;
  preparedDate: string;
  notes: string | null;
  ratings: Rating[];
  averageRating: number | null;
  createdAt: string;
}

export type PreparationSummary = Pick<
  Preparation,
  'id' | 'preparedBy' | 'preparedDate' | 'notes' | 'averageRating'
>;

// Rating types
export interface Rating {
  id: string;
  user: Pick<User, 'id' | 'displayName'>;
  stars: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// Settings types
export interface AppSettings {
  weekStartDay: number; // 0 = Sunday, 1 = Monday, etc.
}

// API Response types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

// Auth types
export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}
