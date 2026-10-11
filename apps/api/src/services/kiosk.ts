import { eq, and, inArray, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getWeekStartDay, getWeekStartDate, formatDate, parseDate } from './menus.js';

export type KioskEntryType = 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';

export interface KioskDay {
  date: string;
  /** null when no dinner entry exists for the day (e.g. no menu created yet). */
  type: KioskEntryType | null;
  skipped: boolean;
  completed: boolean;
  customText: string | null;
  customSideText: string | null;
  restaurantName: string | null;
  restaurantNotes: string | null;
  mainDish: {
    id: string;
    name: string;
    prepTime: number | null;
    cookTime: number | null;
    photoUrl: string | null;
  } | null;
  sides: { id: string; name: string }[];
  prepTasks: { description: string; completed: boolean }[];
  /** For type 'leftovers': the entry the leftovers came from. */
  leftoversSource: { date: string; dishName: string | null; photoUrl: string | null } | null;
}

export interface KioskWeek {
  weekStartDate: string;
  /** Server-local date (TZ aware). Informational: the display's own clock drives rollover. */
  today: string;
  entries: KioskDay[];
}

function emptyDay(date: string): KioskDay {
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
  };
}

/**
 * Read-only week view for the kiosk. Never creates a menu or entries
 * (unlike menus.getOrCreateWeekMenu).
 */
export async function getKioskWeek(familyId: string, dateStr?: string): Promise<KioskWeek> {
  const today = formatDate(new Date());
  const weekStartDay = await getWeekStartDay();
  const weekStart = getWeekStartDate(parseDate(dateStr ?? today), weekStartDay);
  const weekStartDate = formatDate(weekStart);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }

  const menu = await db.query.weeklyMenus.findFirst({
    where: and(
      eq(schema.weeklyMenus.weekStartDate, weekStartDate),
      eq(schema.weeklyMenus.familyId, familyId)
    ),
  });

  if (!menu) {
    return { weekStartDate, today, entries: dates.map(emptyDay) };
  }

  const entryRows = await db
    .select()
    .from(schema.dinnerEntries)
    .where(eq(schema.dinnerEntries.menuId, menu.id));
  const entryIds = entryRows.map((e) => e.id);

  // Leftovers sources, restricted to the same family's menus
  const sourceIds = entryRows.map((e) => e.sourceEntryId).filter((v): v is string => !!v);
  const sourceRows = sourceIds.length
    ? await db
        .select({
          id: schema.dinnerEntries.id,
          date: schema.dinnerEntries.date,
          mainDishId: schema.dinnerEntries.mainDishId,
        })
        .from(schema.dinnerEntries)
        .innerJoin(schema.weeklyMenus, eq(schema.weeklyMenus.id, schema.dinnerEntries.menuId))
        .where(
          and(
            inArray(schema.dinnerEntries.id, sourceIds),
            eq(schema.weeklyMenus.familyId, familyId)
          )
        )
    : [];

  const sideRows = entryIds.length
    ? await db
        .select({
          entryId: schema.entrySideDishes.entryId,
          id: schema.dishes.id,
          name: schema.dishes.name,
        })
        .from(schema.entrySideDishes)
        .innerJoin(schema.dishes, eq(schema.dishes.id, schema.entrySideDishes.dishId))
        .where(inArray(schema.entrySideDishes.entryId, entryIds))
    : [];

  const taskRows = entryIds.length
    ? await db
        .select({
          entryId: schema.prepTasks.entryId,
          description: schema.prepTasks.description,
          completed: schema.prepTasks.completed,
        })
        .from(schema.prepTasks)
        .where(inArray(schema.prepTasks.entryId, entryIds))
        .orderBy(schema.prepTasks.createdAt)
    : [];

  const mainDishIds = [
    ...new Set(
      [...entryRows.map((e) => e.mainDishId), ...sourceRows.map((s) => s.mainDishId)].filter(
        (v): v is string => !!v
      )
    ),
  ];

  const dishRows = mainDishIds.length
    ? await db
        .select({
          id: schema.dishes.id,
          name: schema.dishes.name,
          prepTime: schema.dishes.prepTime,
          cookTime: schema.dishes.cookTime,
          videoThumbnailFilename: schema.dishes.videoThumbnailFilename,
        })
        .from(schema.dishes)
        .where(and(inArray(schema.dishes.id, mainDishIds), eq(schema.dishes.familyId, familyId)))
    : [];
  const dishMap = new Map(dishRows.map((d) => [d.id, d]));

  // Most recent preparation photo per dish (rows come newest first)
  const photoRows = dishRows.length
    ? await db
        .select({ dishId: schema.preparations.dishId, filename: schema.photos.filename })
        .from(schema.photos)
        .innerJoin(schema.preparations, eq(schema.preparations.id, schema.photos.preparationId))
        .where(
          inArray(
            schema.preparations.dishId,
            dishRows.map((d) => d.id)
          )
        )
        .orderBy(desc(schema.photos.createdAt), desc(schema.photos.id))
    : [];
  const prepPhoto = new Map<string, string>();
  for (const p of photoRows) {
    if (p.dishId && !prepPhoto.has(p.dishId)) prepPhoto.set(p.dishId, p.filename);
  }

  const photoUrlFor = (dishId: string): string | null => {
    const file = prepPhoto.get(dishId);
    if (file) return `/uploads/${file}`;
    const thumb = dishMap.get(dishId)?.videoThumbnailFilename;
    return thumb ? `/videos/${thumb}` : null;
  };

  const sourceMap = new Map(sourceRows.map((s) => [s.id, s]));
  const byDate = new Map(entryRows.map((e) => [e.date, e]));

  const days = dates.map((date): KioskDay => {
    const e = byDate.get(date);
    if (!e) return emptyDay(date);

    const main = e.mainDishId ? dishMap.get(e.mainDishId) : undefined;
    const src = e.sourceEntryId ? sourceMap.get(e.sourceEntryId) : undefined;
    const srcDish = src?.mainDishId ? dishMap.get(src.mainDishId) : undefined;

    return {
      date,
      type: e.type,
      skipped: e.skipped,
      completed: e.completed,
      customText: e.customText,
      customSideText: e.customSideText,
      restaurantName: e.restaurantName,
      restaurantNotes: e.restaurantNotes,
      mainDish: main
        ? {
            id: main.id,
            name: main.name,
            prepTime: main.prepTime,
            cookTime: main.cookTime,
            photoUrl: photoUrlFor(main.id),
          }
        : null,
      sides: sideRows.filter((s) => s.entryId === e.id).map((s) => ({ id: s.id, name: s.name })),
      prepTasks: taskRows
        .filter((t) => t.entryId === e.id)
        .map((t) => ({ description: t.description, completed: t.completed })),
      leftoversSource: src
        ? {
            date: src.date,
            dishName: srcDish?.name ?? null,
            photoUrl: srcDish ? photoUrlFor(srcDish.id) : null,
          }
        : null,
    };
  });

  return { weekStartDate, today, entries: days };
}
