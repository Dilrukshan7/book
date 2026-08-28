/**
 * Pure reading-progress logic. No DOM, no storage — every function here is
 * a plain transformation, so the rules (streaks especially) can be reasoned
 * about and tested in isolation.
 */

export const PROGRESS_SCHEMA_VERSION = 1;
export const ACTIVITY_SCHEMA_VERSION = 1;

/** Per-book state. Keys are section codes ("I.1") and checklist ids. */
export interface BookProgress {
  schemaVersion: number;
  sections: Record<string, boolean>;
  notes: Record<string, string>;
  checklist: Record<string, boolean>;
}

/** Site-wide reading activity, shared across every book. */
export interface ActivityState {
  schemaVersion: number;
  /** ISO date (YYYY-MM-DD) -> number of items completed that day. */
  history: Record<string, number>;
  lastActiveDate: string | null;
  streak: number;
}

export function emptyProgress(): BookProgress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    sections: {},
    notes: {},
    checklist: {},
  };
}

export function emptyActivity(): ActivityState {
  return {
    schemaVersion: ACTIVITY_SCHEMA_VERSION,
    history: {},
    lastActiveDate: null,
    streak: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Dates
 *
 * Deliberately local-time, not UTC: a "day" should mean the reader's day.
 * ------------------------------------------------------------------ */

export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The calendar day before `key`, as a key. */
export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

/**
 * Records one completed item and advances the streak.
 *
 * The streak increments only on the first item of a new day, and resets to
 * 1 when the previous active day was not yesterday.
 */
export function recordActivity(
  activity: ActivityState,
  today: string = dateKey(),
): ActivityState {
  const history = { ...activity.history };
  history[today] = (history[today] ?? 0) + 1;

  if (activity.lastActiveDate === today) {
    return { ...activity, history };
  }

  const continues = activity.lastActiveDate === previousDay(today);
  return {
    ...activity,
    history,
    streak: continues ? (activity.streak || 0) + 1 : 1,
    lastActiveDate: today,
  };
}

/**
 * The streak as it should be *displayed*.
 *
 * A stored streak goes stale the moment a day is missed, so a reader who
 * last studied three weeks ago must not still see a burning 12. The stored
 * value is left untouched; only the presentation is corrected.
 */
export function displayStreak(
  activity: ActivityState,
  today: string = dateKey(),
): number {
  const { lastActiveDate, streak } = activity;
  if (!lastActiveDate || !streak) return 0;
  if (lastActiveDate === today || lastActiveDate === previousDay(today)) {
    return streak;
  }
  return 0;
}

export function completedToday(
  activity: ActivityState,
  today: string = dateKey(),
): number {
  return activity.history[today] ?? 0;
}

/* ------------------------------------------------------------------ *
 * Derived counts
 * ------------------------------------------------------------------ */

export interface Stats {
  done: number;
  total: number;
  percent: number;
}

export function countSections(
  progress: BookProgress,
  codes: readonly string[],
): Stats {
  // Count against the book's actual section list rather than the stored
  // keys, so sections removed from a book in a later edit cannot inflate
  // the total or push progress past 100%.
  const done = codes.reduce(
    (sum, code) => sum + (progress.sections[code] ? 1 : 0),
    0,
  );
  const total = codes.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Index of the first unread section, or -1 when the book is finished. */
export function nextUnreadIndex(
  progress: BookProgress,
  codes: readonly string[],
): number {
  return codes.findIndex((code) => !progress.sections[code]);
}

/* ------------------------------------------------------------------ *
 * Import / export
 *
 * This pair replaces accounts: it is the supported way to move progress
 * between devices, so the payload is versioned and validated on the way in.
 * ------------------------------------------------------------------ */

export interface ExportPayload {
  format: 'readbooks-progress';
  version: number;
  exportedAt: string;
  activity: ActivityState;
  books: Record<string, BookProgress>;
}

export function buildExport(
  books: Record<string, BookProgress>,
  activity: ActivityState,
): ExportPayload {
  return {
    format: 'readbooks-progress',
    version: 1,
    exportedAt: new Date().toISOString(),
    activity,
    books,
  };
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  payload?: ExportPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerces unknown parsed JSON into a BookProgress, dropping bad fields. */
function sanitizeProgress(value: unknown): BookProgress {
  const base = emptyProgress();
  if (!isRecord(value)) return base;

  const sections: Record<string, boolean> = {};
  if (isRecord(value.sections)) {
    for (const [k, v] of Object.entries(value.sections)) {
      if (typeof v === 'boolean') sections[k] = v;
    }
  }

  const notes: Record<string, string> = {};
  if (isRecord(value.notes)) {
    for (const [k, v] of Object.entries(value.notes)) {
      if (typeof v === 'string') notes[k] = v;
    }
  }

  const checklist: Record<string, boolean> = {};
  if (isRecord(value.checklist)) {
    for (const [k, v] of Object.entries(value.checklist)) {
      if (typeof v === 'boolean') checklist[k] = v;
    }
  }

  return { ...base, sections, notes, checklist };
}

function sanitizeActivity(value: unknown): ActivityState {
  const base = emptyActivity();
  if (!isRecord(value)) return base;

  const history: Record<string, number> = {};
  if (isRecord(value.history)) {
    for (const [k, v] of Object.entries(value.history)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        history[k] = Math.floor(v);
      }
    }
  }

  return {
    ...base,
    history,
    lastActiveDate:
      typeof value.lastActiveDate === 'string' ? value.lastActiveDate : null,
    streak:
      typeof value.streak === 'number' && Number.isFinite(value.streak)
        ? Math.max(0, Math.floor(value.streak))
        : 0,
  };
}

/**
 * Parses an exported file. Rejects anything that is not recognisably ours
 * so a mistaken file selection reports a clear error rather than wiping
 * real progress with garbage.
 */
export function parseImport(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'That file does not contain a progress object.' };
  }

  // Accept the prototype's flat shape too, so early users are not stranded.
  if (!('format' in parsed) && isRecord(parsed.sections)) {
    return {
      ok: true,
      payload: {
        format: 'readbooks-progress',
        version: 1,
        exportedAt: new Date().toISOString(),
        activity: sanitizeActivity(parsed),
        books: { __legacy__: sanitizeProgress(parsed) },
      },
    };
  }

  if (parsed.format !== 'readbooks-progress') {
    return {
      ok: false,
      error: 'That file was not exported from this site.',
    };
  }

  const books: Record<string, BookProgress> = {};
  if (isRecord(parsed.books)) {
    for (const [slug, value] of Object.entries(parsed.books)) {
      books[slug] = sanitizeProgress(value);
    }
  }

  return {
    ok: true,
    payload: {
      format: 'readbooks-progress',
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      exportedAt:
        typeof parsed.exportedAt === 'string'
          ? parsed.exportedAt
          : new Date().toISOString(),
      activity: sanitizeActivity(parsed.activity),
      books,
    },
  };
}
