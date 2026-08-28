import { createStorage, keys, readJSON, writeJSON } from './storage';
import {
  type ActivityState,
  type BookProgress,
  buildExport,
  completedToday,
  countSections,
  dateKey,
  displayStreak,
  emptyActivity,
  emptyProgress,
  nextUnreadIndex,
  parseImport,
  recordActivity,
} from './progress';
import { STORAGE_NAMESPACE } from '../site.config';

/**
 * Progressive-enhancement controller for the book roadmap.
 *
 * The page is fully rendered server-side; this attaches saved state to it.
 * Every element is addressed through `data-*` hooks so markup and behaviour
 * stay decoupled, and the visual checked state is pure CSS (`:checked`), so
 * toggling a section never depends on JavaScript re-rendering anything.
 */

const SAVE_DEBOUNCE_MS = 250;
const NOTE_DEBOUNCE_MS = 400;

export function initTracker(root: HTMLElement): void {
  const bookSlug = root.dataset.bookSlug;
  if (!bookSlug) return;

  const storage = createStorage();
  const progressKey = keys.progress(bookSlug);
  const activityKey = keys.activity();

  let progress = readJSON<BookProgress>(storage, progressKey, emptyProgress());
  let activity = readJSON<ActivityState>(storage, activityKey, emptyActivity());

  // Normalise shapes in case an older or partial object was stored.
  progress = { ...emptyProgress(), ...progress };
  activity = { ...emptyActivity(), ...activity };

  /* --------------------------------------------------------------- *
   * Element lookup
   * --------------------------------------------------------------- */
  const sectionInputs = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[data-section]'),
  );
  const checklistInputs = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[data-checklist]'),
  );
  const noteAreas = Array.from(
    root.querySelectorAll<HTMLTextAreaElement>('textarea[data-note]'),
  );
  const partEls = Array.from(
    root.querySelectorAll<HTMLElement>('[data-part]'),
  );

  // Reading order comes from the DOM, so it can never drift out of sync
  // with what is actually on the page.
  const orderedCodes = sectionInputs.map((el) => el.dataset.code ?? '');

  const toast = createToast(root);

  let saveTimer: number | undefined;
  function scheduleSave(delay = SAVE_DEBOUNCE_MS): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      writeJSON(storage, progressKey, progress);
      writeJSON(storage, activityKey, activity);
    }, delay);
  }

  /* --------------------------------------------------------------- *
   * Rendering derived state
   * --------------------------------------------------------------- */
  function refreshStats(): void {
    const { done, total, percent } = countSections(progress, orderedCodes);

    setText(root, '[data-stat-done]', `${done} / ${total}`);
    setText(root, '[data-stat-percent]', `${percent}%`);
    setText(root, '[data-stat-streak]', String(displayStreak(activity)));
    setText(root, '[data-stat-today]', String(completedToday(activity)));
    setText(root, '[data-progress-text]', `${percent}%`);

    const fill = root.querySelector<HTMLElement>('[data-progress-fill]');
    if (fill) fill.style.width = `${percent}%`;

    const bar = root.querySelector<HTMLElement>('[data-progressbar]');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(percent));
      bar.setAttribute(
        'aria-valuetext',
        `${done} of ${total} sections read, ${percent} percent`,
      );
    }
  }

  function refreshPart(partEl: HTMLElement): void {
    const inputs = Array.from(
      partEl.querySelectorAll<HTMLInputElement>('input[data-section]'),
    );
    const done = inputs.filter((i) => i.checked).length;
    const total = inputs.length;
    const complete = total > 0 && done === total;

    setText(partEl, '[data-part-count]', `${done}/${total}`);

    const fill = partEl.querySelector<HTMLElement>('[data-part-fill]');
    if (fill) fill.style.width = total ? `${(done / total) * 100}%` : '0%';

    partEl.toggleAttribute('data-part-complete', complete);

    const badge = partEl.querySelector<HTMLElement>('[data-part-badge]');
    if (badge) {
      const label = badge.dataset.partBadge ?? '';
      badge.textContent = complete ? '✓' : label;
    }
  }

  function refreshAllParts(): void {
    partEls.forEach(refreshPart);
  }

  function refreshAll(): void {
    refreshAllParts();
    refreshStats();
  }

  /* --------------------------------------------------------------- *
   * Hydrate from storage
   * --------------------------------------------------------------- */
  for (const input of sectionInputs) {
    const code = input.dataset.code;
    if (code) input.checked = Boolean(progress.sections[code]);
  }
  for (const input of checklistInputs) {
    const key = input.dataset.key;
    if (key) input.checked = Boolean(progress.checklist[key]);
  }
  for (const area of noteAreas) {
    const code = area.dataset.code;
    if (!code) continue;
    const value = progress.notes[code] ?? '';
    area.value = value;
    syncNoteButton(root, code, value);
  }

  refreshAll();

  if (!storage.persistent) {
    toast(
      'Your browser is blocking site storage, so progress will only last for this visit.',
      6000,
    );
  }

  /* --------------------------------------------------------------- *
   * Interaction
   * --------------------------------------------------------------- */
  root.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.matches('input[data-section]')) {
      const code = target.dataset.code;
      if (!code) return;
      progress.sections[code] = target.checked;
      if (target.checked) activity = recordActivity(activity);

      const partEl = target.closest<HTMLElement>('[data-part]');
      if (partEl) refreshPart(partEl);
      refreshStats();
      scheduleSave();
      return;
    }

    if (target.matches('input[data-checklist]')) {
      const key = target.dataset.key;
      if (!key) return;
      progress.checklist[key] = target.checked;
      if (target.checked) activity = recordActivity(activity);
      refreshStats();
      scheduleSave();
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (!target.matches('textarea[data-note]')) return;

    const code = target.dataset.code;
    if (!code) return;

    const value = target.value;
    if (value.trim() === '') {
      delete progress.notes[code];
    } else {
      progress.notes[code] = value;
    }
    syncNoteButton(root, code, value);
    scheduleSave(NOTE_DEBOUNCE_MS);
  });

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const noteToggle = target.closest<HTMLElement>('[data-note-toggle]');
    if (noteToggle) {
      toggleNote(root, noteToggle);
      return;
    }

    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;

    switch (actionEl.dataset.action) {
      case 'expand-all':
        partEls.forEach((p) => p.setAttribute('open', ''));
        break;

      case 'collapse-all':
        partEls.forEach((p) => p.removeAttribute('open'));
        break;

      case 'next-unread':
        jumpToNextUnread();
        break;

      case 'export':
        exportProgress();
        break;

      case 'import':
        root
          .querySelector<HTMLInputElement>('[data-import-input]')
          ?.click();
        break;

      case 'reset':
        resetBook();
        break;
    }
  });

  root
    .querySelector<HTMLInputElement>('[data-import-input]')
    ?.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) void importProgress(file);
      // Clear so selecting the same file twice still fires a change event.
      input.value = '';
    });

  /* --------------------------------------------------------------- *
   * Actions
   * --------------------------------------------------------------- */
  function jumpToNextUnread(): void {
    const index = nextUnreadIndex(progress, orderedCodes);
    if (index === -1) {
      toast('You have read every section of this book. Nice.');
      return;
    }

    const input = sectionInputs[index];
    if (!input) return;

    input.closest<HTMLElement>('[data-part]')?.setAttribute('open', '');
    const row = input.closest<HTMLElement>('[data-section-row]') ?? input;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Focus after the smooth scroll settles so keyboard users land on it.
    window.setTimeout(() => input.focus({ preventScroll: true }), 400);

    const code = orderedCodes[index];
    const title = input.dataset.title ?? '';
    toast(`Next up: ${code}${title ? ` — ${title}` : ''}`);
  }

  function exportProgress(): void {
    const books: Record<string, BookProgress> = {};
    const prefix = `${STORAGE_NAMESPACE}:progress:`;
    for (const key of storage.keys(prefix)) {
      const slug = key.slice(prefix.length);
      books[slug] = readJSON<BookProgress>(storage, key, emptyProgress());
    }
    // Include unsaved in-memory edits for the book being viewed.
    books[bookSlug!] = progress;

    const payload = buildExport(books, activity);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `readbooks-progress-${dateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Progress exported. Keep the file to restore it on another device.');
  }

  async function importProgress(file: File): Promise<void> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast('That file could not be read.');
      return;
    }

    const result = parseImport(text);
    if (!result.ok || !result.payload) {
      toast(result.error ?? 'That file could not be imported.');
      return;
    }

    const payload = result.payload;
    const bookCount = Object.keys(payload.books).length;
    const confirmed = window.confirm(
      `Import progress for ${bookCount} book${bookCount === 1 ? '' : 's'}?\n\n` +
        'This replaces your current progress on this device.',
    );
    if (!confirmed) return;

    for (const [slug, bookProgress] of Object.entries(payload.books)) {
      // A legacy prototype export has no book slug of its own; it can only
      // have come from this book, so adopt it here.
      const targetSlug = slug === '__legacy__' ? bookSlug! : slug;
      writeJSON(storage, keys.progress(targetSlug), bookProgress);
    }
    writeJSON(storage, activityKey, payload.activity);

    toast('Progress imported. Reloading…');
    window.setTimeout(() => window.location.reload(), 900);
  }

  function resetBook(): void {
    const confirmed = window.confirm(
      'Reset your progress, notes, and checklists for this book?\n\n' +
        'Your reading streak and other books are not affected. ' +
        'This cannot be undone.',
    );
    if (!confirmed) return;

    progress = emptyProgress();
    writeJSON(storage, progressKey, progress);

    for (const input of sectionInputs) input.checked = false;
    for (const input of checklistInputs) input.checked = false;
    for (const area of noteAreas) {
      area.value = '';
      if (area.dataset.code) syncNoteButton(root, area.dataset.code, '');
    }
    refreshAll();
    toast('Progress for this book has been reset.');
  }
}

/* ------------------------------------------------------------------ *
 * Small DOM helpers
 * ------------------------------------------------------------------ */

function setText(scope: ParentNode, selector: string, value: string): void {
  const el = scope.querySelector<HTMLElement>(selector);
  if (el) el.textContent = value;
}

function syncNoteButton(
  root: ParentNode,
  code: string,
  value: string,
): void {
  const button = root.querySelector<HTMLElement>(
    `[data-note-toggle][data-code="${cssEscape(code)}"]`,
  );
  if (!button) return;
  const hasNote = value.trim() !== '';
  button.toggleAttribute('data-has-note', hasNote);
  const label = button.querySelector<HTMLElement>('[data-note-label]');
  if (label) label.textContent = hasNote ? 'Note' : 'Add note';
}

function toggleNote(root: ParentNode, button: HTMLElement): void {
  const code = button.dataset.code;
  if (!code) return;
  const panel = root.querySelector<HTMLElement>(
    `[data-note-panel][data-code="${cssEscape(code)}"]`,
  );
  if (!panel) return;

  const isOpen = !panel.hidden;
  panel.hidden = isOpen;
  button.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) panel.querySelector('textarea')?.focus();
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

/** Returns a function that shows a transient, screen-reader-announced message. */
function createToast(root: ParentNode): (msg: string, ms?: number) => void {
  const el = root.querySelector<HTMLElement>('[data-toast]');
  let timer: number | undefined;

  return (message: string, ms = 2600) => {
    if (!el) return;
    el.textContent = message;
    el.setAttribute('data-visible', '');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => el.removeAttribute('data-visible'), ms);
  };
}
