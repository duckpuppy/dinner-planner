import { useState } from 'react';
import { CheckCircle2, Circle, Clock, ImageOff, UtensilsCrossed } from 'lucide-react';
import { mediaUrl } from '@/lib/apiOrigin';
import { resolveKioskKey, type KioskEntry } from '@/lib/kiosk';
import { cn, localDateStr } from '@/lib/utils';
import {
  useIdleCursor,
  useIsLandscape,
  useKioskWeek,
  useLocalNow,
  useWakeLock,
} from '@/hooks/useKioskDisplay';

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function entryTitle(entry: KioskEntry): string {
  if (entry.skipped) return 'No dinner';
  switch (entry.type) {
    case null:
      return 'Nothing planned';
    case 'assembled':
      return entry.mainDish?.name ?? 'Dinner';
    case 'custom':
      return entry.customText || 'Dinner';
    case 'dining_out':
      return entry.restaurantName ? `Out: ${entry.restaurantName}` : 'Dining out';
    case 'leftovers':
      return entry.leftoversSource?.dishName
        ? `Leftovers: ${entry.leftoversSource.dishName}`
        : 'Leftovers';
    case 'fend_for_self':
      return 'Fend for yourself';
  }
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-dvh items-center justify-center bg-slate-950 p-8 text-center text-slate-50">
      <p className="max-w-3xl text-balance text-4xl font-semibold leading-tight">{children}</p>
    </main>
  );
}

function Photo({ url, name }: { url: string | null | undefined; name: string }) {
  if (!url) {
    return (
      <div
        className="flex size-full items-center justify-center bg-slate-800 text-slate-400"
        data-testid="kiosk-no-photo"
      >
        <ImageOff className="size-16" aria-hidden="true" />
      </div>
    );
  }
  return <img src={mediaUrl(url)} alt={name} className="size-full object-cover" />;
}

function Hero({ entry, landscape }: { entry: KioskEntry | undefined; landscape: boolean }) {
  const title = entry ? entryTitle(entry) : 'Nothing planned';
  const dish = entry?.mainDish;
  const photoUrl =
    entry && !entry.skipped
      ? entry.type === 'assembled'
        ? dish?.photoUrl
        : entry.type === 'leftovers'
          ? entry.leftoversSource?.photoUrl
          : null
      : null;
  const showPhoto = entry?.type === 'assembled' || entry?.type === 'leftovers';
  const notes = entry?.skipped ? null : entry?.customText;
  const sideText = entry?.skipped ? null : entry?.customSideText;
  const tasks = entry?.prepTasks ?? [];
  const sides = entry?.skipped ? [] : (entry?.sides ?? []);
  const prep = dish?.prepTime ?? null;
  const cook = dish?.cookTime ?? null;

  return (
    <section
      aria-labelledby="kiosk-today-title"
      className={cn(
        'flex min-h-0 min-w-0 overflow-hidden rounded-3xl bg-slate-900 ring-2 ring-amber-400',
        landscape ? 'flex-row' : 'flex-col'
      )}
      data-testid="kiosk-hero"
    >
      {showPhoto && !entry?.skipped && (
        <div className={cn('shrink-0', landscape ? 'w-2/5' : 'h-2/5 w-full')}>
          <Photo url={photoUrl} name={title} />
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-4 overflow-hidden p-8">
        <p className="text-2xl font-semibold uppercase text-amber-300">Tonight</p>
        <h1
          id="kiosk-today-title"
          className="line-clamp-3 text-balance text-6xl font-bold leading-tight 2xl:text-8xl"
        >
          {title}
        </h1>
        {entry?.type === 'dining_out' && !entry.skipped && entry.restaurantNotes && (
          <p className="text-pretty text-3xl text-slate-300">{entry.restaurantNotes}</p>
        )}
        {notes && entry?.type !== 'custom' && (
          <p className="text-pretty text-3xl text-slate-300">{notes}</p>
        )}
        {sides.length > 0 && (
          <p className="text-pretty text-3xl text-slate-200">
            <span className="font-semibold text-slate-50">With: </span>
            {sides.map((s) => s.name).join(', ')}
          </p>
        )}
        {sideText && <p className="text-pretty text-3xl text-slate-200">{sideText}</p>}
        {(prep != null || cook != null) && !entry?.skipped && (
          <p className="flex items-center gap-3 text-3xl tabular-nums text-slate-200">
            <Clock className="size-8 shrink-0" aria-hidden="true" />
            {prep != null && <span>Prep {prep} min</span>}
            {prep != null && cook != null && <span aria-hidden="true">·</span>}
            {cook != null && <span>Cook {cook} min</span>}
          </p>
        )}
        {tasks.length > 0 && (
          <div>
            <h2 className="mb-2 text-2xl font-semibold uppercase text-slate-300">Prep today</h2>
            <ul className="space-y-1">
              {tasks.map((t, i) => (
                <li
                  key={`${i}-${t.description}`}
                  className={cn(
                    'flex items-center gap-3 text-3xl',
                    t.completed ? 'text-slate-400 line-through' : 'text-slate-50'
                  )}
                >
                  {t.completed ? (
                    <CheckCircle2 className="size-7 shrink-0" role="img" aria-label="Done" />
                  ) : (
                    <Circle className="size-7 shrink-0" role="img" aria-label="To do" />
                  )}
                  <span className="min-w-0 truncate">{t.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!entry && <UtensilsCrossed className="size-16 text-slate-500" aria-hidden="true" />}
      </div>
    </section>
  );
}

function DayTile({
  entry,
  today,
  tomorrow,
}: {
  entry: KioskEntry;
  today: string;
  tomorrow: string;
}) {
  const isToday = entry.date === today;
  const isPast = entry.date < today;
  const isTomorrow = entry.date === tomorrow;
  const weekday = parseDate(entry.date).toLocaleDateString([], { weekday: 'short' });
  return (
    <li
      data-testid={`kiosk-day-${entry.date}`}
      data-state={isToday ? 'today' : isPast ? 'past' : isTomorrow ? 'tomorrow' : 'future'}
      aria-current={isToday ? 'date' : undefined}
      className={cn(
        'min-w-0 flex-1 rounded-2xl px-4 py-3',
        isToday ? 'bg-slate-800 ring-2 ring-amber-400' : 'bg-slate-900',
        isPast ? 'text-slate-400' : 'text-slate-50'
      )}
    >
      <p className="text-xl font-semibold uppercase">
        {weekday}
        {isToday && <span className="ml-2 text-amber-300">Today</span>}
        {isTomorrow && <span className="ml-2 text-amber-300">Tomorrow</span>}
      </p>
      <p className="line-clamp-2 text-balance text-2xl font-medium">{entryTitle(entry)}</p>
    </li>
  );
}

export function KioskPage() {
  // Lazy init resolves (and strips) ?key= exactly once per mount.
  const [key] = useState(resolveKioskKey);
  const now = useLocalNow();
  const today = localDateStr(now);
  const tomorrow = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const { week, status, stale } = useKioskWeek(key, today);
  const landscape = useIsLandscape();
  const cursorHidden = useIdleCursor();
  useWakeLock();

  if (!key || status === 'unauthorized') {
    return (
      <FullScreenMessage>
        {status === 'unauthorized'
          ? 'This display link is invalid or was revoked. Ask an admin for a new link.'
          : 'This display needs a display link. Ask an admin for one.'}
      </FullScreenMessage>
    );
  }

  if (!week) {
    return (
      <main
        aria-busy="true"
        className="flex h-dvh items-center justify-center bg-slate-950 text-3xl text-slate-300"
      >
        Loading…
      </main>
    );
  }

  const todayEntry = week.entries.find((e) => e.date === today);

  return (
    <main
      data-testid="kiosk-root"
      data-orientation={landscape ? 'landscape' : 'portrait'}
      className={cn(
        'flex h-dvh flex-col gap-6 overflow-hidden bg-slate-950 p-6 text-slate-50',
        'pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        cursorHidden && 'cursor-none'
      )}
    >
      <header className="flex items-baseline justify-between gap-6">
        <p className="text-3xl font-medium text-slate-200">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-6xl font-bold tabular-nums" data-testid="kiosk-clock">
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
      </header>

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-6',
          landscape ? 'grid-cols-3 grid-rows-1' : 'grid-cols-1 grid-rows-[1fr_auto]'
        )}
        data-testid="kiosk-layout"
      >
        <div className={cn('flex min-h-0 flex-col', landscape && 'col-span-2')}>
          <Hero entry={todayEntry} landscape={landscape} />
        </div>
        <nav aria-label="This week" className="min-h-0 min-w-0">
          <ul
            className={cn('flex gap-3', landscape ? 'h-full flex-col [&>li]:flex-1' : 'flex-row')}
            data-testid="kiosk-week"
          >
            {week.entries.map((e) => (
              <DayTile key={e.date} entry={e} today={today} tomorrow={tomorrow} />
            ))}
          </ul>
        </nav>
      </div>

      {stale && (
        <p role="status" className="text-xl text-slate-300">
          Can&apos;t reach the server. Showing the last update.
        </p>
      )}
    </main>
  );
}
