import type { CollectionEntry } from 'astro:content';

export type BookEntry = CollectionEntry<'books'>;
export type Book = BookEntry['data'];
export type Part = Book['parts'][number];
export type Section = Part['sections'][number];

/** A link ready to render: every field resolved, nothing left to compute. */
export interface ResolvedLink {
  href: string;
  label: string;
  icon: string;
  /** `free` marks a full, freely readable copy of the section itself. */
  variant: 'free' | 'default';
}

/**
 * Builds a lecture URL from the registry.
 *
 * An explicit `url` wins; otherwise `slug` is resolved against
 * `course.lectureBase`. The schema guarantees one of the two exists and
 * that a base is present whenever slugs are used, so this returns null
 * only for an unknown lecture number.
 */
export function lectureUrl(book: Book, n: number): string | null {
  const lecture = book.lectures.find((l) => l.n === n);
  if (!lecture) return null;
  if (lecture.url) return lecture.url;
  if (!lecture.slug || !book.course?.lectureBase) return null;

  const base = book.course.lectureBase.endsWith('/')
    ? book.course.lectureBase
    : `${book.course.lectureBase}/`;
  return `${base}${lecture.slug}/`;
}

export function lectureTitle(book: Book, n: number): string | null {
  return book.lectures.find((l) => l.n === n)?.title ?? null;
}

/**
 * Expands a section's authored links into renderable chips.
 *
 * Two conveniences are applied here rather than repeated across every
 * section in YAML, matching the prototype's behaviour:
 *   - a problem-set chip is appended when the book defines one
 *   - a table-of-contents fallback is appended when a section has no
 *     reading or lecture material of its own
 */
export function resolveSectionLinks(
  book: Book,
  section: Section,
): ResolvedLink[] {
  const links: ResolvedLink[] = [];

  for (const link of section.links) {
    switch (link.kind) {
      case 'section-pdf':
        links.push({
          href: link.url,
          label: link.label,
          icon: '📄',
          variant: 'free',
        });
        break;

      case 'lecture': {
        const href = lectureUrl(book, link.ref);
        if (!href) break; // Unreachable: schema validates every ref.
        const title = lectureTitle(book, link.ref);
        links.push({
          href,
          label: title
            ? `Lecture ${link.ref}: ${title}`
            : `Lecture ${link.ref}`,
          icon: '🎥',
          variant: 'default',
        });
        break;
      }

      case 'problems':
        if (link.url ?? book.defaults.problemsUrl) {
          links.push({
            href: (link.url ?? book.defaults.problemsUrl)!,
            label: link.label,
            icon: '✏️',
            variant: 'default',
          });
        }
        break;

      case 'link':
        links.push({
          href: link.url,
          label: link.label,
          icon: link.icon,
          variant: 'default',
        });
        break;
    }
  }

  const hasProblems = section.links.some((l) => l.kind === 'problems');
  if (!hasProblems && book.defaults.problemsUrl) {
    links.push({
      href: book.defaults.problemsUrl,
      label: 'Problems',
      icon: '✏️',
      variant: 'default',
    });
  }

  const hasMaterial = section.links.some(
    (l) => l.kind === 'section-pdf' || l.kind === 'lecture' || l.kind === 'link',
  );
  if (!hasMaterial && book.defaults.fallbackUrl) {
    links.push({
      href: book.defaults.fallbackUrl,
      label: book.defaults.fallbackLabel,
      icon: '📑',
      variant: 'default',
    });
  }

  return links;
}

/** Finds a section by its code, with the part that contains it. */
export function findSection(
  book: Book,
  code: string,
): { part: Part; section: Section } | null {
  for (const part of book.parts) {
    const section = part.sections.find((s) => s.code === code);
    if (section) return { part, section };
  }
  return null;
}

/** Every section code in reading order. The canonical ordering for stats. */
export function sectionCodes(book: Book): string[] {
  return book.parts.flatMap((part) => part.sections.map((s) => s.code));
}

export function totalSections(book: Book): number {
  return book.parts.reduce((sum, part) => sum + part.sections.length, 0);
}

/** URL-safe form of a section code: "I.1" -> "i-1". */
export function sectionSlug(code: string): string {
  return code.replace(/\./g, '-').toLowerCase();
}

/** Stable DOM id / anchor fragment for a section code such as "I.1". */
export function sectionAnchor(code: string): string {
  return `s-${sectionSlug(code)}`;
}

/** Route to a section's study guide page. */
export function sectionHref(bookSlug: string, code: string): string {
  return `/books/${bookSlug}/${sectionSlug(code)}`;
}

/** Checklist item key, unique within a book. */
export function checklistKey(partId: string, index: number): string {
  return `${partId}-${index}`;
}

/** Content-collection id for a section's study guide, if it declares one. */
export function guideId(bookSlug: string, section: Section): string | null {
  return section.guide ? `${bookSlug}/${section.guide}` : null;
}

/**
 * Build-time integrity check for cross-collection references, which Zod
 * cannot express on its own.
 *
 * Called from getStaticPaths so a section pointing at a guide file that
 * does not exist fails the build loudly instead of rendering a dead link.
 */
export function assertGuidesResolve(
  book: Book,
  bookId: string,
  knownGuideIds: readonly string[],
): void {
  const known = new Set(knownGuideIds);
  const missing: string[] = [];

  for (const part of book.parts) {
    for (const section of part.sections) {
      const id = guideId(bookId, section);
      if (id && !known.has(id)) {
        missing.push(
          `  section ${section.code} -> src/content/books/${bookId}/guides/${section.guide}.md`,
        );
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Book "${bookId}" references ${missing.length} study guide file(s) that do not exist:\n` +
        missing.join('\n') +
        '\n\nEither create the file(s) or remove the `guide:` key from those sections.',
    );
  }
}
