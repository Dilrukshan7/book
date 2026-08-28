import { STORAGE_NAMESPACE } from '../site.config';

/**
 * Minimal persistence surface the UI depends on.
 *
 * Everything client-side talks to this interface rather than to
 * `localStorage` directly, so adding cross-device sync later means writing
 * a new adapter — not touching the tracker or any component.
 */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Stored keys beginning with `prefix`. Used to export every book at once. */
  keys(prefix: string): string[];
  /** False when values live only for this page view. */
  readonly persistent: boolean;
}

/**
 * Fallback used when the browser refuses storage (private mode, disabled
 * site data, embedded webviews). Keeps the UI fully interactive for the
 * session instead of throwing on every interaction.
 */
class MemoryAdapter implements StorageAdapter {
  readonly persistent = false;
  #map = new Map<string, string>();

  get(key: string): string | null {
    return this.#map.has(key) ? this.#map.get(key)! : null;
  }
  set(key: string, value: string): void {
    this.#map.set(key, value);
  }
  remove(key: string): void {
    this.#map.delete(key);
  }
  keys(prefix: string): string[] {
    return [...this.#map.keys()].filter((k) => k.startsWith(prefix));
  }
}

class LocalStorageAdapter implements StorageAdapter {
  readonly persistent = true;
  #store: Storage;

  constructor(store: Storage) {
    this.#store = store;
  }

  get(key: string): string | null {
    try {
      return this.#store.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      this.#store.setItem(key, value);
    } catch {
      // Quota exceeded, or storage revoked mid-session. Swallow rather
      // than break the interaction; `probeStorage` already warned the user
      // if storage was unavailable at load.
    }
  }

  remove(key: string): void {
    try {
      this.#store.removeItem(key);
    } catch {
      /* no-op */
    }
  }

  keys(prefix: string): string[] {
    const found: string[] = [];
    try {
      for (let i = 0; i < this.#store.length; i++) {
        const key = this.#store.key(i);
        if (key !== null && key.startsWith(prefix)) found.push(key);
      }
    } catch {
      /* no-op */
    }
    return found;
  }
}

/**
 * Returns a working adapter, preferring localStorage.
 *
 * Note that merely *reading* `window.localStorage` throws in some browser
 * configurations, so the whole probe — including a real write — sits inside
 * the try block.
 */
export function createStorage(): StorageAdapter {
  try {
    const store = globalThis.localStorage;
    const probeKey = `${STORAGE_NAMESPACE}:probe`;
    store.setItem(probeKey, '1');
    store.removeItem(probeKey);
    return new LocalStorageAdapter(store);
  } catch {
    return new MemoryAdapter();
  }
}

/* ------------------------------------------------------------------ *
 * Key layout
 *
 * Progress is namespaced per book so two books can never collide, while
 * activity (the streak) is site-wide so it survives moving between books.
 * ------------------------------------------------------------------ */

export const keys = {
  progress: (bookSlug: string) => `${STORAGE_NAMESPACE}:progress:${bookSlug}`,
  activity: () => `${STORAGE_NAMESPACE}:activity`,
} as const;

/** Reads and parses JSON, falling back on absent or corrupt values. */
export function readJSON<T>(
  storage: StorageAdapter,
  key: string,
  fallback: T,
): T {
  const raw = storage.get(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return parsed as T;
  } catch {
    // Corrupt entry — treat as absent rather than wiping it, so a future
    // migration could still attempt recovery.
    return fallback;
  }
}

export function writeJSON(
  storage: StorageAdapter,
  key: string,
  value: unknown,
): void {
  storage.set(key, JSON.stringify(value));
}
