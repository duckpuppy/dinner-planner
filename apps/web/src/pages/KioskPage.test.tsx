import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
vi.mock('@/lib/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.0.0' }) }),
}));

import { KioskPage } from './KioskPage';
import { KIOSK_KEY_STORAGE, type KioskEntry } from '@/lib/kiosk';

const DATES = [
  '2026-06-07',
  '2026-06-08',
  '2026-06-09',
  '2026-06-10',
  '2026-06-11',
  '2026-06-12',
  '2026-06-13',
];

function entry(date: string, over: Partial<KioskEntry> = {}): KioskEntry {
  return {
    date,
    type: null,
    skipped: false,
    completed: false,
    customText: null,
    customSideText: null,
    restaurantName: null,
    restaurantNotes: null,
    mainDish: null,
    sides: [],
    prepTasks: [],
    leftoversSource: null,
    ...over,
  };
}

function weekWith(overrides: Record<string, Partial<KioskEntry>> = {}) {
  return {
    weekStartDate: DATES[0],
    today: '2026-06-10',
    entries: DATES.map((d) => entry(d, overrides[d])),
  };
}

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

let fetchMock: ReturnType<typeof vi.fn>;
let matchMediaState: { matches: boolean; listeners: Set<(e: { matches: boolean }) => void> };

function installMatchMedia(landscape: boolean) {
  matchMediaState = { matches: landscape, listeners: new Set() };
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return matchMediaState.matches;
    },
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
      matchMediaState.listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
      matchMediaState.listeners.delete(cb),
  })) as never;
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderKiosk() {
  render(<KioskPage />);
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({
    now: new Date(2026, 5, 10, 12, 0, 0),
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  localStorage.setItem(KIOSK_KEY_STORAGE, 'dpk_test');
  window.history.replaceState(null, '', '/kiosk');
  installMatchMedia(true);
  fetchMock = vi.fn().mockResolvedValue(okResponse(weekWith()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  // @ts-expect-error cleanup of test shim
  delete window.matchMedia;
  // @ts-expect-error cleanup of test shim
  delete navigator.wakeLock;
});

describe('KioskPage key handling', () => {
  it('persists ?key= and strips it from the URL', async () => {
    localStorage.clear();
    window.history.replaceState(null, '', '/kiosk?key=dpk_fresh');
    await renderKiosk();
    expect(localStorage.getItem(KIOSK_KEY_STORAGE)).toBe('dpk_fresh');
    expect(window.location.search).toBe('');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer dpk_fresh');
  });

  it('shows a message and clears the stored key when the link is rejected', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await renderKiosk();
    expect(
      screen.getByText('This display link is invalid or was revoked. Ask an admin for a new link.')
    ).toBeInTheDocument();
    expect(localStorage.getItem(KIOSK_KEY_STORAGE)).toBeNull();
  });

  it('asks for a link when no key is available', async () => {
    localStorage.clear();
    await renderKiosk();
    expect(screen.getByText(/needs a display link/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('KioskPage entry states', () => {
  it('renders an assembled dinner with photo, sides, times and prep tasks', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        weekWith({
          '2026-06-10': {
            type: 'assembled',
            customText: 'Marinate overnight',
            mainDish: {
              id: 'd1',
              name: 'Lemon Chicken',
              prepTime: 15,
              cookTime: 40,
              photoUrl: '/uploads/chicken.jpg',
            },
            sides: [
              { id: 's1', name: 'Rice' },
              { id: 's2', name: 'Peas' },
            ],
            prepTasks: [
              { description: 'Thaw chicken', completed: true },
              { description: 'Chop lemons', completed: false },
            ],
          },
        })
      )
    );
    await renderKiosk();
    const hero = screen.getByTestId('kiosk-hero');
    expect(hero).toHaveTextContent('Lemon Chicken');
    expect(hero).toHaveTextContent('Rice, Peas');
    expect(hero).toHaveTextContent('Prep 15 min');
    expect(hero).toHaveTextContent('Cook 40 min');
    expect(hero).toHaveTextContent('Marinate overnight');
    expect(hero).toHaveTextContent('Thaw chicken');
    expect(hero).toHaveTextContent('Chop lemons');
    expect(hero.querySelector('img')).toHaveAttribute('src', '/uploads/chicken.jpg');
  });

  it('shows a placeholder when the dish has no photo', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        weekWith({
          '2026-06-10': {
            type: 'assembled',
            mainDish: { id: 'd', name: 'Soup', prepTime: null, cookTime: null, photoUrl: null },
          },
        })
      )
    );
    await renderKiosk();
    expect(screen.getByTestId('kiosk-no-photo')).toBeInTheDocument();
  });

  it('renders dining out with restaurant and notes', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        weekWith({
          '2026-06-10': {
            type: 'dining_out',
            restaurantName: 'Luigi',
            restaurantNotes: 'Table at 6',
          },
        })
      )
    );
    await renderKiosk();
    const hero = screen.getByTestId('kiosk-hero');
    expect(hero).toHaveTextContent('Out: Luigi');
    expect(hero).toHaveTextContent('Table at 6');
  });

  it('renders leftovers with the source dish and photo', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        weekWith({
          '2026-06-10': {
            type: 'leftovers',
            leftoversSource: {
              date: '2026-06-08',
              dishName: 'Lasagna',
              photoUrl: '/uploads/l.jpg',
            },
          },
        })
      )
    );
    await renderKiosk();
    const hero = screen.getByTestId('kiosk-hero');
    expect(hero).toHaveTextContent('Leftovers: Lasagna');
    expect(hero.querySelector('img')).toHaveAttribute('src', '/uploads/l.jpg');
  });

  it('renders fend for yourself', async () => {
    fetchMock.mockResolvedValue(okResponse(weekWith({ '2026-06-10': { type: 'fend_for_self' } })));
    await renderKiosk();
    expect(screen.getByTestId('kiosk-hero')).toHaveTextContent('Fend for yourself');
  });

  it('renders a custom entry with side text', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        weekWith({
          '2026-06-10': { type: 'custom', customText: 'Pizza night', customSideText: 'Salad' },
        })
      )
    );
    await renderKiosk();
    const hero = screen.getByTestId('kiosk-hero');
    expect(hero).toHaveTextContent('Pizza night');
    expect(hero).toHaveTextContent('Salad');
  });

  it('renders a skipped day', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        weekWith({ '2026-06-10': { type: 'custom', customText: 'Hidden', skipped: true } })
      )
    );
    await renderKiosk();
    const hero = screen.getByTestId('kiosk-hero');
    expect(hero).toHaveTextContent('No dinner');
    expect(hero).not.toHaveTextContent('Hidden');
  });

  it('renders the no-entry state', async () => {
    await renderKiosk();
    expect(screen.getByTestId('kiosk-hero')).toHaveTextContent('Nothing planned');
  });
});

describe('KioskPage week strip and layout', () => {
  it('highlights today, dims past days and labels tomorrow', async () => {
    await renderKiosk();
    const today = screen.getByTestId('kiosk-day-2026-06-10');
    expect(today).toHaveAttribute('data-state', 'today');
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveTextContent('Today');
    const past = screen.getByTestId('kiosk-day-2026-06-09');
    expect(past).toHaveAttribute('data-state', 'past');
    expect(past.className).toContain('text-slate-400');
    const tomorrow = screen.getByTestId('kiosk-day-2026-06-11');
    expect(tomorrow).toHaveAttribute('data-state', 'tomorrow');
    expect(tomorrow).toHaveTextContent('Tomorrow');
    expect(screen.getByTestId('kiosk-day-2026-06-12')).toHaveAttribute('data-state', 'future');
  });

  it('uses a sidebar in landscape and a strip in portrait, following orientation changes', async () => {
    await renderKiosk();
    expect(screen.getByTestId('kiosk-root')).toHaveAttribute('data-orientation', 'landscape');
    expect(screen.getByTestId('kiosk-layout').className).toContain('grid-cols-3');
    expect(screen.getByTestId('kiosk-week').className).toContain('flex-col');

    await act(async () => {
      matchMediaState.matches = false;
      matchMediaState.listeners.forEach((cb) => cb({ matches: false }));
    });
    expect(screen.getByTestId('kiosk-root')).toHaveAttribute('data-orientation', 'portrait');
    expect(screen.getByTestId('kiosk-layout').className).toContain('grid-cols-1');
    expect(screen.getByTestId('kiosk-week').className).toContain('flex-row');
  });

  it('starts in portrait when the media query says so', async () => {
    installMatchMedia(false);
    await renderKiosk();
    expect(screen.getByTestId('kiosk-root')).toHaveAttribute('data-orientation', 'portrait');
  });

  it('shows the clock in the locale format', async () => {
    await renderKiosk();
    const expected = new Date(2026, 5, 10, 12, 0).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(screen.getByTestId('kiosk-clock')).toHaveTextContent(expected);
  });

  it('updates the clock each minute', async () => {
    await renderKiosk();
    await flush(60_000);
    const expected = new Date(2026, 5, 10, 12, 1).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(screen.getByTestId('kiosk-clock')).toHaveTextContent(expected);
  });
});

describe('KioskPage polling and rollover', () => {
  it('polls every 60 seconds', async () => {
    await renderKiosk();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await flush(60_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rolls over at local midnight: new today, refetch for the new date', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const date = new URL(url, 'http://x').searchParams.get('date');
      return okResponse({
        ...weekWith({
          '2026-06-10': { type: 'custom', customText: 'Wednesday dinner' },
          '2026-06-11': { type: 'custom', customText: 'Thursday dinner' },
        }),
        today: date,
      });
    });
    await renderKiosk();
    expect(screen.getByTestId('kiosk-hero')).toHaveTextContent('Wednesday dinner');
    expect(fetchMock.mock.calls[0][0]).toContain('date=2026-06-10');

    // 12:00 -> just past midnight
    await flush(12 * 3_600_000 + 100);

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('date=2026-06-11'))).toBe(true);
    expect(screen.getByTestId('kiosk-hero')).toHaveTextContent('Thursday dinner');
    expect(screen.getByTestId('kiosk-day-2026-06-11')).toHaveAttribute('data-state', 'today');
    expect(screen.getByTestId('kiosk-day-2026-06-10')).toHaveAttribute('data-state', 'past');
  });

  it('re-syncs and refetches when the page becomes visible again', async () => {
    await renderKiosk();
    const before = fetchMock.mock.calls.length;
    vi.setSystemTime(new Date(2026, 5, 11, 7, 0, 0)); // device slept through midnight
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('date=2026-06-11'))).toBe(true);
  });

  it('keeps the last data and shows a notice when a refresh fails', async () => {
    await renderKiosk();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await flush(60_000);
    expect(screen.getByRole('status')).toHaveTextContent(/last update/i);
    expect(screen.getByTestId('kiosk-hero')).toBeInTheDocument();
  });
});

describe('KioskPage always-on behaviour', () => {
  it('requests a screen wake lock and re-acquires it when visible again', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const sentinel = { released: false, release };
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    await renderKiosk();
    expect(request).toHaveBeenCalledWith('screen');

    sentinel.released = true; // the browser drops the lock when the tab is hidden
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when the wake lock is unsupported or denied', async () => {
    await renderKiosk(); // no navigator.wakeLock
    expect(screen.getByTestId('kiosk-root')).toBeInTheDocument();
    cleanup();
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    await renderKiosk();
    expect(screen.getByTestId('kiosk-root')).toBeInTheDocument();
  });

  it('hides the cursor after 3s of inactivity and shows it on movement', async () => {
    await renderKiosk();
    const root = screen.getByTestId('kiosk-root');
    expect(root.className).not.toContain('cursor-none');
    await flush(3_000);
    expect(root.className).toContain('cursor-none');
    await act(async () => {
      window.dispatchEvent(new Event('mousemove'));
    });
    expect(root.className).not.toContain('cursor-none');
  });
});
