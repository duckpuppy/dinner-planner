/**
 * Thin API client for seeding and for asserting server state. Talks to the same origin the
 * browser uses. Every client sends a unique X-Forwarded-For (the API runs with trustProxy) so
 * the per-IP login/refresh rate limits never couple tests together.
 */

export const BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

export const PASSWORD = 'e2e-password-123';

export interface TestUser {
  key: 'alice' | 'bob';
  username: string;
  displayName: string;
  initials: string;
  password: string;
}

export const ALICE: TestUser = {
  key: 'alice',
  username: 'alice',
  displayName: 'Alice Anderson',
  initials: 'AA',
  password: PASSWORD,
};

export const BOB: TestUser = {
  key: 'bob',
  username: 'bob',
  displayName: 'Bob Brown',
  initials: 'BB',
  password: PASSWORD,
};

let ipCounter = 0;
/** A fresh fake client IP per call (TEST-NET-3 range). */
export function nextFakeIp(): string {
  ipCounter += 1;
  return `203.0.113.${(ipCounter % 250) + 1}`;
}

export class ApiClient {
  private token: string | null = null;
  private readonly ip = nextFakeIp();

  constructor(private readonly user: TestUser) {}

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    expectStatus: number[] = [200, 201, 204]
  ): Promise<T> {
    if (!this.token && path !== '/api/auth/login') await this.login();
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-Forwarded-For': this.ip,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!expectStatus.includes(res.status)) {
      throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async login(): Promise<void> {
    const out = await this.request<{ accessToken: string }>('POST', '/api/auth/login', {
      username: this.user.username,
      password: this.user.password,
    });
    this.token = out.accessToken;
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
}

export interface GroceryResponse {
  weekStartDate: string;
  groceries: { name: string; unit: string | null }[];
  customItems: { id: string; name: string }[];
  checks: {
    itemKey: string;
    checked: boolean;
    checkedBy: { id: string; displayName: string } | null;
  }[];
  checkedKeys: string[];
}

export function groceryKey(name: string, unit: string | null = null): string {
  return `${name.toLowerCase()}::${unit?.toLowerCase() ?? ''}`;
}

/** YYYY-MM-DD in local time, matching the SPA's localDateStr. */
export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Seed a week: one dish with the given ingredient names, assigned to the entry for `date`.
 * Returns the item keys. Each test uses its own week so seeded data never overlaps.
 */
export async function seedWeek(
  api: ApiClient,
  date: string,
  ingredientNames: string[],
  dishName: string
): Promise<void> {
  const { dish } = await api.post<{ dish: { id: string } }>('/api/dishes', {
    name: dishName,
    type: 'main',
    ingredients: ingredientNames.map((name) => ({
      name,
      quantity: null,
      unit: null,
      notes: null,
      category: 'Produce',
      storeIds: [],
    })),
  });
  const { menu } = await api.get<{ menu: { entries: { id: string; date: string }[] } }>(
    `/api/menus/week/${date}`
  );
  const entry = menu.entries.find((e) => e.date.slice(0, 10) === date) ?? menu.entries[0];
  await api.patch(`/api/entries/${entry.id}`, { type: 'assembled', mainDishId: dish.id });
}

export async function getGroceries(api: ApiClient, date: string): Promise<GroceryResponse> {
  return api.get<GroceryResponse>(`/api/menus/week/${date}/groceries`);
}
