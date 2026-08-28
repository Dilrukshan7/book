import { createStorage, keys, readJSON, writeJSON } from './storage';
import {
  type ActivityState,
  type BookProgress,
  buildExport,
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
 * Elements are addressed through `data-*` hooks so markup and behaviour stay
 * decoupled, and the read state is pure CSS (`:checked`), so ticking a
 * section never depends on JavaScript re-rendering anything.
 */

const SAVE_DEBOUNCE_MS = 250;
const NOTE_DEBOUNCE_MS = 400;

export function initTracker(root: HTMLElement): void {
  const bookSlug = root.dataset.bookSlug;
  if (!bookSlug) return;

  const storage = createStorage();
  const progressKey = keys.progress(bookSlug);
  const activityKey = keys.activity();

  let progress = {
    ...emptyProgress(),
    ...readJSON<BookProgress>(storage, progressKey, emptyProgress()),
  };
  let activity = {
    ...emptyActivity(),
    ...readJSON<ActivityState>(storage, activityKey, emptyActivity()),
  };

  /* --------------------------------------------------------------- *
   * Elements
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
  const partEls = Array.from(root.querySelectorAll<HTMLElement>('[data-part]'));

  // Reading order comes from the DOM, so it can never drift out of sync with
  // what is actually on the page.
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
   * Derived UI
   * --------------------------------------------------------------- */

  function refreshGauge(): void {
    const { done, total, percent } = countSections(progress, orderedCodes);

    setText(root, '[data-gauge-done]', String(done));
    setText(root, '[data-gauge-total]', `/ ${total}`);
    setText(root, '[data-gauge-caption]', `${percent}% of the book`);

    const fill = root.querySelector<HTMLElement>('[data-gauge-fill]');
    if (fill) fill.style.width = `${percent}%`;

    const bar = root.querySelector<HTMLElement>('[data-progressbar]');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(percent));
      bar.setAttribute(
        'aria-valuetext',
        `${done} of ${total} sections read, ${percent} percent`,
      );
    }

    // A zero streak is discouraging and says nothing, so it stays hidden
    // until there is one to report.
    const streak = displayStreak(activity);
    const streakEl = root.querySelector<HTMLElement>('[data-gauge-streak]');
    if (streakEl) {
      streakEl.hidden = streak < 1;
      setText(streakEl, '[data-gauge-streak-value]', String(streak));
      const unit = streakEl.querySelector<HTMLElement>('[data-gauge-streak-unit]');
      if (unit) unit.textContent = streak === 1 ? 'day' : 'days';
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
    partEl.toggleAttribute('data-part-complete', complete);

    // Mirror into the contents rail.
    const id = partEl.dataset.partId;
    if (id) {
      const link = root.querySelector<HTMLElement>(
        `[data-railnav-part="${cssEscape(id)}"]`,
      );
      if (link) {
        setText(link, '[data-railnav-count]', `${done}/${total}`);
        link.toggleAttribute('data-complete', complete);
      }
    }
  }

  /**
   * Marks the next unread section and points the resume control at it.
   *
   * This is the answer to the returning reader's only real question, so it
   * is recomputed on every change rather than only at load.
   */
  function refreshNext(): void {
    for (const row of root.querySelectorAll('[data-section-row][data-next]')) {
      row.removeAttribute('data-next');
    }

    const index = nextUnreadIndex(progress, orderedCodes);
    const resume = root.querySelector<HTMLAnchorElement>('[data-resume]');
    const { done } = countSections(progress, orderedCodes);

    if (index === -1) {
      if (resume) {
        resume.hidden = true;
      }
      return;
    }

    const input = sectionInputs[index];
    const row = input?.closest<HTMLElement>('[data-section-row]');
    if (row) row.setAttribute('data-next', '');

    if (resume && input && row) {
      const verb = done === 0 ? 'Start' : 'Continue';
      const code = input.dataset.code ?? '';
      const title = input.dataset.title ?? '';

      resume.hidden = false;
      resume.href = `#${row.id}`;
      setText(resume, '[data-resume-label]', verb);
      setText(resume, '[data-resume-code]', code);
      setText(resume, '[data-resume-title]', title);
      // The visual is a composed layout whose fragments would otherwise run
      // together when announced, so the name is written out in full.
      setText(
        resume,
        '[data-resume-sr]',
        `${verb} reading at section ${code}, ${title}`,
      );
    }
  }

  function refreshAll(): void {
    partEls.forEach(refreshPart);
    refreshGauge();
    refreshNext();
  }

  /* --------------------------------------------------------------- *
   * Hydrate
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
      'This browser is blocking site storage, so progress will last only for this visit.',
      6000,
    );
  }

  /* --------------------------------------------------------------- *
   * Interaction
   * --------------------------------------------------------------- */
  root.addEventListener('change', (event) => {
    const target = event.target;

    if (target instanceof HTMLSelectElement && target.matches('[data-jump]')) {
      const id = target.value;
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
      return;
    }

    if (!(target instanceof HTMLInputElement)) return;

    if (target.matches('input[data-section]')) {
      const code = target.dataset.code;
      if (!code) return;
      progress.sections[code] = target.checked;
      if (target.checked) activity = recordActivity(activity);

      const partEl = target.closest<HTMLElement>('[data-part]');
      if (partEl) refreshPart(partEl);
      refreshGauge();
      refreshNext();
      scheduleSave();
      return;
    }

    if (target.matches('input[data-checklist]')) {
      const key = target.dataset.key;
      if (!key) return;
      progress.checklist[key] = target.checked;
      if (target.checked) activity = recordActivity(activity);
      refreshGauge();
      scheduleSave();
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
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
      case 'export':
        exportProgress();
        break;
      case 'import':
        root.querySelector<HTMLInputElement>('[data-import-input]')?.click();
        break;
      case 'reset':
        resetBook();
        break;
    }
  });

  // Focus the target section after the browser finishes the hash jump, so a
  // keyboard user lands on the control rather than merely near it.
  root.querySelector<HTMLAnchorElement>('[data-resume]')?.addEventListener(
    'click',
    () => {
      const index = nextUnreadIndex(progress, orderedCodes);
      const input = sectionInputs[index];
      if (input) window.setTimeout(() => input.focus({ preventScroll: true }), 260);
    },
  );

  root
    .querySelector<HTMLInputElement>('[data-import-input]')
    ?.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) void importProgress(file);
      // Cleared so choosing the same file twice still fires a change event.
      input.value = '';
    });

  /* --------------------------------------------------------------- *
   * Actions
   * --------------------------------------------------------------- */
  function exportProgress(): void {
    const books: Record<string, BookProgress> = {};
    const prefix = `${STORAGE_NAMESPACE}:progress:`;
    for (const key of storage.keys(prefix)) {
      books[key.slice(prefix.length)] = readJSON<BookProgress>(
        storage,
        key,
        emptyProgress(),
      );
    }
    books[bookSlug!] = progress;

    const blob = new Blob([JSON.stringify(buildExport(books, activity), null, 2)], {
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
    const count = Object.keys(payload.books).length;
    const confirmed = window.confirm(
      `Import progress for ${count} book${count === 1 ? '' : 's'}?\n\n` +
        'This replaces your current progress on this device.',
    );
    if (!confirmed) return;

    for (const [slug, bookProgress] of Object.entries(payload.books)) {
      // A legacy export carries no book slug of its own; it can only have
      // come from this book, so adopt it here.
      const targetSlug = slug === '__legacy__' ? bookSlug! : slug;
      writeJSON(storage, keys.progress(targetSlug), bookProgress);
    }
    writeJSON(storage, activityKey, payload.activity);

    toast('Progress imported. Reloading.');
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
 * DOM helpers
 * ------------------------------------------------------------------ */

function setText(scope: ParentNode, selector: string, value: string): void {
  const el = scope.querySelector<HTMLElement>(selector);
  if (el) el.textContent = value;
}

function syncNoteButton(root: ParentNode, code: string, value: string): void {
  const button = root.querySelector<HTMLElement>(
    `[data-note-toggle][data-code="${cssEscape(code)}"]`,
  );
  if (!button) return;
  button.toggleAttribute('data-has-note', value.trim() !== '');
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

/** A transient, screen-reader-announced message. */
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
