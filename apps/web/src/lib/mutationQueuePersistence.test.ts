import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { store, calls, mockToast } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  calls: [] as string[],
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('idb-keyval', () => ({
  get: vi.fn((k: string) => Promise.resolve(store.get(k))),
  set: vi.fn((k: string, v: unknown) => {
    store.set(k, structuredClone(v));
    return Promise.resolve();
  }),
  del: vi.fn((k: string) => {
    store.delete(k);
    return Promise.resolve();
  }),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  menus: {
    setGroceryCheck: vi.fn(async (v: { itemKey: string; checked: boolean }) => {
      calls.push(`check:${v.itemKey}:${v.checked}`);
      return {
        itemKey: v.itemKey,
        checked: v.checked,
        updatedAt: 1,
        checkedBy: null,
        changed: true,
      };
    }),
    clearGroceryChecks: vi.fn(async () => {
      calls.push('clear');
      return { cleared: 0 };
    }),
    addCustomItem: vi.fn(async (_w: string, v: { id: string }) => {
      calls.push(`custom:${v.id}`);
      return { id: v.id };
    }),
    deleteCustomItem: vi.fn(),
  },
  standing: { add: vi.fn(), delete: vi.fn() },
  pantry: { create: vi.fn(), delete: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: mockToast }));

const OWNER = { userId: 'u1', familyId: 'f1' };
const KEY = 'dinner-planner-mutation-queue';
const UUID_A = '8f14e45f-ceea-4f67-a1b2-0123456789ab';
const WEEK = '2024-06-10';

type Mods = {
  qc: typeof import('./queryClient');
  off: typeof import('./offlineMutations');
  persist: typeof import('./mutationQueuePersistence');
  rq: typeof import('@tanstack/react-query');
};

/** Fresh module graph = a freshly started app (new QueryClient, defaults registered on import). */
async function boot(): Promise<Mods> {
  vi.resetModules();
  const rq = await import('@tanstack/react-query');
  // node_modules are not reset with the module graph: onlineManager is a process singleton.
  rq.onlineManager.setOnline(true);
  const qc = await import('./queryClient');
  const off = await import('./offlineMutations');
  const persist = await import('./mutationQueuePersistence');
  return { qc, off, persist, rq };
}

function persisted(mutations: unknown[], over: Record<string, unknown> = {}) {
  return { queueSchema: 1, userId: 'u1', familyId: 'f1', mutations, ...over };
}

function pendingMutation(key: string[], variables: unknown) {
  return {
    mutationKey: key,
    scope: { id: 'offline-sync' },
    state: {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'pending',
      variables,
      submittedAt: 1,
    },
  };
}

const checkVars = (itemKey: string, checked = true) => ({
  weekDate: WEEK,
  itemKey,
  itemName: itemKey,
  checked,
  clientUpdatedAt: 5,
});

beforeEach(() => {
  store.clear();
  calls.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('saving', () => {
  it('debounces and writes {queueSchema, userId, familyId, mutations} for pending offline mutations', async () => {
    vi.useFakeTimers();
    const { qc, off, persist, rq } = await boot();
    rq.onlineManager.setOnline(false);
    persist.startQueuePersistence(OWNER);

    void off.enqueue('checkSet', checkVars('a'));
    void off.enqueue('customAdd', { id: UUID_A, weekDate: WEEK, name: 'Towels' });
    expect(store.has(KEY)).toBe(false); // still inside the debounce window

    await vi.advanceTimersByTimeAsync(150);

    const saved = store.get(KEY) as {
      queueSchema: number;
      userId: string;
      familyId: string;
      mutations: Array<{ mutationKey: string[]; state: { variables: unknown } }>;
    };
    expect(saved).toMatchObject({ queueSchema: 1, userId: 'u1', familyId: 'f1' });
    expect(saved.mutations.map((m) => m.mutationKey.join('.'))).toEqual([
      'offline.grocery.check.set',
      'offline.grocery.custom.add',
    ]);
    expect(saved.mutations[1].state.variables).toMatchObject({ id: UUID_A });
    expect(qc.queryClient.isMutating({ mutationKey: ['offline'] })).toBe(2);
  });

  it('flushes immediately when the page is hidden or on pagehide', async () => {
    vi.useFakeTimers();
    const { off, persist, rq } = await boot();
    rq.onlineManager.setOnline(false);
    persist.startQueuePersistence(OWNER);

    void off.enqueue('checkSet', checkVars('a'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.has(KEY)).toBe(true);

    store.clear();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.has(KEY)).toBe(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('removes the persisted queue once it has drained', async () => {
    vi.useFakeTimers();
    const { persist, off } = await boot();
    persist.startQueuePersistence(OWNER);

    void off.enqueue('checkSet', checkVars('a')); // online: runs and completes
    await vi.advanceTimersByTimeAsync(300);

    expect(calls).toEqual(['check:a:true']);
    expect(store.has(KEY)).toBe(false);
  });

  it('stops saving after stopQueuePersistence', async () => {
    vi.useFakeTimers();
    const { off, persist, rq } = await boot();
    rq.onlineManager.setOnline(false);
    persist.startQueuePersistence(OWNER);
    void off.enqueue('checkSet', checkVars('a'));
    persist.stopQueuePersistence();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.has(KEY)).toBe(false);
  });
});

describe('restoring (simulated app restart)', () => {
  it('persist -> restart -> hydrate as paused -> resume sends requests in FIFO order', async () => {
    vi.useFakeTimers();
    // Session 1: offline, make changes, let them persist.
    const s1 = await boot();
    s1.rq.onlineManager.setOnline(false);
    s1.persist.startQueuePersistence(OWNER);
    void s1.off.enqueue('checkSet', checkVars('a'));
    void s1.off.enqueue('customAdd', { id: UUID_A, weekDate: WEEK, name: 'Towels' });
    void s1.off.enqueue('checkSet', checkVars('a', false));
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toEqual([]);
    vi.useRealTimers();

    // Session 2: brand-new client; the app starts offline.
    const s2 = await boot();
    s2.rq.onlineManager.setOnline(false);
    await s2.persist.restoreMutationQueue(OWNER);

    const restored = s2.qc.queryClient.getMutationCache().getAll();
    expect(restored).toHaveLength(3);
    expect(restored.every((m) => m.state.isPaused && m.state.status === 'pending')).toBe(true);
    expect(calls).toEqual([]);

    s2.rq.onlineManager.setOnline(true);
    await s2.qc.queryClient.resumePausedMutations();
    await vi.waitFor(() =>
      expect(calls).toEqual(['check:a:true', `custom:${UUID_A}`, 'check:a:false'])
    );
  });

  it('resumes immediately when restored while already online', async () => {
    const { qc, persist } = await boot();
    store.set(
      KEY,
      persisted([pendingMutation(['offline', 'grocery', 'check', 'set'], checkVars('z'))])
    );
    await persist.restoreMutationQueue(OWNER);
    await vi.waitFor(() => expect(calls).toEqual(['check:z:true']));
    await vi.waitFor(() => expect(qc.queryClient.isMutating()).toBe(0));
  });

  it('deletes a queue that belongs to a different user or family', async () => {
    for (const over of [{ userId: 'someone-else' }, { familyId: 'other-family' }]) {
      const { qc, persist } = await boot();
      store.set(
        KEY,
        persisted([pendingMutation(['offline', 'grocery', 'check', 'set'], checkVars('a'))], over)
      );
      await persist.restoreMutationQueue(OWNER);
      expect(qc.queryClient.getMutationCache().getAll()).toHaveLength(0);
      expect(store.has(KEY)).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it('deletes a queue with an unknown schema version', async () => {
    const { qc, persist } = await boot();
    store.set(KEY, persisted([], { queueSchema: 99 }));
    await persist.restoreMutationQueue(OWNER);
    expect(qc.queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(store.has(KEY)).toBe(false);
  });

  it('drops mutations whose persisted variables are invalid, keeps the rest', async () => {
    const { qc, persist, rq } = await boot();
    rq.onlineManager.setOnline(false);
    store.set(
      KEY,
      persisted([
        pendingMutation(['offline', 'grocery', 'check', 'set'], checkVars('ok')),
        pendingMutation(['offline', 'grocery', 'check', 'set'], {
          ...checkVars('x'),
          checked: 'yes',
        }),
        pendingMutation(['offline', 'grocery', 'check', 'clear'], { weekDate: WEEK }),
        pendingMutation(['offline', 'grocery', 'custom', 'add'], { weekDate: WEEK, name: 'no id' }),
        pendingMutation(['offline', 'grocery', 'custom', 'add'], {
          id: 'not-a-uuid',
          weekDate: WEEK,
          name: 'bad id',
        }),
        pendingMutation(['offline', 'grocery', 'custom', 'add'], {
          id: UUID_A,
          weekDate: 'June 10',
          name: 'bad week',
        }),
        pendingMutation(['offline', 'pantry', 'add'], { id: UUID_A, ingredientName: '' }),
        pendingMutation(['offline', 'pantry', 'delete'], {}),
        pendingMutation(['offline', 'mystery'], { id: UUID_A }),
        pendingMutation(['other', 'key'], { id: UUID_A }),
        { mutationKey: ['offline', 'grocery', 'custom', 'delete'], state: null },
        pendingMutation(['offline', 'grocery', 'standing', 'delete'], { id: 'si-1' }),
      ])
    );
    await persist.restoreMutationQueue(OWNER);

    const keys = qc.queryClient
      .getMutationCache()
      .getAll()
      .map((m) => m.options.mutationKey?.join('.'));
    expect(keys).toEqual(['offline.grocery.check.set', 'offline.grocery.standing.delete']);
  });

  it('forgets a stale attempt: restored mutations always start paused with clean error state', async () => {
    const { qc, persist, rq } = await boot();
    rq.onlineManager.setOnline(false);
    const m = pendingMutation(['offline', 'pantry', 'delete'], { id: 'p1' });
    m.state.failureCount = 2;
    m.state.isPaused = false;
    store.set(KEY, persisted([m]));
    await persist.restoreMutationQueue(OWNER);
    const [restored] = qc.queryClient.getMutationCache().getAll();
    expect(restored.state).toMatchObject({ isPaused: true, failureCount: 0, error: null });
  });

  it('does nothing when the owner changed while the read was in flight', async () => {
    const { qc, persist } = await boot();
    store.set(KEY, persisted([pendingMutation(['offline', 'pantry', 'delete'], { id: 'p1' })]));
    await persist.restoreMutationQueue(OWNER, () => false);
    expect(qc.queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(store.has(KEY)).toBe(true);
  });

  it('survives an idb read failure', async () => {
    const { qc, persist } = await boot();
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockRejectedValueOnce(new Error('idb broken'));
    await expect(persist.restoreMutationQueue(OWNER)).resolves.toBeUndefined();
    expect(qc.queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('discarding', () => {
  it('countAndDiscardPersistedQueue returns the count and deletes the queue', async () => {
    const { persist } = await boot();
    store.set(KEY, persisted([{}, {}, {}]));
    expect(await persist.countAndDiscardPersistedQueue()).toBe(3);
    expect(store.has(KEY)).toBe(false);
  });

  it('countAndDiscardPersistedQueue returns 0 when nothing (or garbage) is stored', async () => {
    const { persist } = await boot();
    expect(await persist.countAndDiscardPersistedQueue()).toBe(0);
    store.set(KEY, 'garbage');
    expect(await persist.countAndDiscardPersistedQueue()).toBe(0);
    expect(store.has(KEY)).toBe(false);
  });

  it('discardQueueAndNotify toasts how many changes were lost (plural and singular)', async () => {
    const { persist } = await boot();
    store.set(KEY, persisted([{}, {}, {}]));
    expect(await persist.discardQueueAndNotify()).toBe(3);
    expect(mockToast.error).toHaveBeenCalledWith(
      '3 unsynced changes were discarded because you were signed out'
    );
    expect(store.has(KEY)).toBe(false);

    mockToast.error.mockClear();
    store.set(KEY, persisted([{}]));
    await persist.discardQueueAndNotify();
    expect(mockToast.error).toHaveBeenCalledWith(
      '1 unsynced change was discarded because you were signed out'
    );
  });

  it('discardQueueAndNotify is quiet (and idempotent) when there is nothing to discard', async () => {
    const { persist } = await boot();
    expect(await persist.discardQueueAndNotify()).toBe(0);
    store.set(KEY, persisted([{}]));
    await persist.discardQueueAndNotify();
    mockToast.error.mockClear();
    expect(await persist.discardQueueAndNotify()).toBe(0);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('survives idb failures while discarding', async () => {
    const { persist } = await boot();
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockRejectedValueOnce(new Error('x'));
    vi.mocked(idb.del).mockRejectedValueOnce(new Error('y'));
    expect(await persist.countAndDiscardPersistedQueue()).toBe(0);
  });

  it('resetMutationQueue drops in-memory mutations and the persisted queue', async () => {
    const { qc, off, persist, rq } = await boot();
    rq.onlineManager.setOnline(false);
    void off.enqueue('checkSet', checkVars('a'));
    store.set(KEY, persisted([]));
    await persist.resetMutationQueue();
    expect(qc.queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(store.has(KEY)).toBe(false);
  });
});
