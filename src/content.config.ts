import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// Namespace import of Astro's own zod build: same module instance Astro
// validates with, and avoids the deprecated `z` alias re-exported from
// `astro:content`.
import * as z from 'astro/zod';

/* ------------------------------------------------------------------ *
 * Link kinds
 *
 * `lecture` refers to an entry in the book's own `lectures` registry by
 * number, so a lecture URL is written once and reused across sections.
 * Everything else carries an explicit URL.
 * ------------------------------------------------------------------ */
const sectionLinkSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lecture'),
    ref: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('section-pdf'),
    url: z.url(),
    label: z.string().default('Read full section (free PDF)'),
  }),
  z.object({
    kind: z.literal('problems'),
    url: z.url().optional(),
    label: z.string().default('Problems'),
  }),
  z.object({
    kind: z.literal('link'),
    url: z.url(),
    label: z.string(),
    icon: z.string().default('\u{1F517}'),
  }),
]);

const lectureSchema = z
  .object({
    n: z.number().int().positive(),
    title: z.string().min(1),
    /** Appended to `course.lectureBase` to form the URL. */
    slug: z.string().optional(),
    /** Full URL, overriding `slug`. For lectures hosted outside the course. */
    url: z.url().optional(),
  })
  .refine((l) => Boolean(l.slug || l.url), {
    message: 'A lecture must define either `slug` or `url`.',
  });

const sectionSchema = z.object({
  /** Stable identifier used as the persistence key, e.g. "I.1". */
  code: z.string().min(1),
  title: z.string().min(1),
  links: z.array(sectionLinkSchema).default([]),
  /** Filename stem under `guides/`, e.g. `i-1` -> `guides/i-1.md`. */
  guide: z.string().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
});

const partSchema = z.object({
  /** Roman numeral or short label, e.g. "I". Also the anchor id. */
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(''),
  sections: z.array(sectionSchema).min(1),
  checklist: z.array(z.string()).default([]),
});

const resourceSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
  kind: z.enum(['pdf', 'video', 'playlist', 'page', 'solutions']),
  /** Rights holder / publisher of this resource, shown for attribution. */
  source: z.string().min(1),
  icon: z.string().default('\u{1F517}'),
});

const bookSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
    title: z.string().min(1),
    author: z.string().min(1),
    year: z.number().int(),
    publisher: z.string().optional(),
    isbn: z.string().optional(),
    tagline: z.string().min(1),
    description: z.string().min(1),

    /** `planned` books render on the landing page but have no roadmap yet. */
    status: z.enum(['available', 'planned']).default('available'),
    /** Controls ordering on the landing page; lower sorts first. */
    order: z.number().int().default(100),

    /** The rights holder's own page for this book. */
    officialPage: z.url(),
    /** Where to buy a legitimate copy. Surfaced prominently. */
    buyUrl: z.url().optional(),

    /** Honest, per-book explanation of exactly what is and isn't free. */
    accessNotice: z.string().min(1),

    /** Typographic cover; we never reproduce publisher cover art. */
    cover: z.object({
      initials: z.string().min(1).max(4),
      accent: z.string().default('#5b8cff'),
      accent2: z.string().default('#7ad3b2'),
    }),

    /** Optional free course the book maps onto. */
    course: z
      .object({
        name: z.string().min(1),
        url: z.url(),
        license: z.string().optional(),
        licenseUrl: z.url().optional(),
        /** Prefix for lecture `slug` values. */
        lectureBase: z.url().optional(),
      })
      .optional(),

    /** Fallbacks so per-section link lists stay free of repetition. */
    defaults: z
      .object({
        problemsUrl: z.url().optional(),
        /** Used when a section has no links of its own. */
        fallbackUrl: z.url().optional(),
        fallbackLabel: z.string().default('Find this section in the contents'),
      })
      .default({ fallbackLabel: 'Find this section in the contents' }),

    resources: z.array(resourceSchema).default([]),
    lectures: z.array(lectureSchema).default([]),
    parts: z.array(partSchema).min(1),
  })
  /* -------------------------------------------------------------- *
   * Build-time integrity. A malformed book fails `astro build`
   * rather than silently rendering a broken page in the browser.
   * -------------------------------------------------------------- */
  .superRefine((book, ctx) => {
    const lectureNumbers = new Set(book.lectures.map((l) => l.n));

    // Duplicate lecture numbers would make `ref` ambiguous.
    const seenLectures = new Set<number>();
    for (const lecture of book.lectures) {
      if (seenLectures.has(lecture.n)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lectures'],
          message: `Duplicate lecture number ${lecture.n}.`,
        });
      }
      seenLectures.add(lecture.n);
    }

    // A lecture slug is meaningless without a base to resolve it against.
    if (!book.course?.lectureBase) {
      const slugOnly = book.lectures.filter((l) => l.slug && !l.url);
      if (slugOnly.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['course', 'lectureBase'],
          message:
            `${slugOnly.length} lecture(s) use \`slug\` but ` +
            '`course.lectureBase` is not set to resolve them against.',
        });
      }
    }

    const seenPartIds = new Set<string>();
    const seenCodes = new Set<string>();

    book.parts.forEach((part, partIndex) => {
      if (seenPartIds.has(part.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['parts', partIndex, 'id'],
          message: `Duplicate part id "${part.id}".`,
        });
      }
      seenPartIds.add(part.id);

      part.sections.forEach((section, sectionIndex) => {
        // Section codes are persistence keys — collisions would silently
        // merge two sections' saved progress.
        if (seenCodes.has(section.code)) {
          ctx.addIssue({
            code: 'custom',
            path: ['parts', partIndex, 'sections', sectionIndex, 'code'],
            message:
              `Duplicate section code "${section.code}". Codes are used as ` +
              'storage keys and must be unique within a book.',
          });
        }
        seenCodes.add(section.code);

        section.links.forEach((link, linkIndex) => {
          if (link.kind === 'lecture' && !lectureNumbers.has(link.ref)) {
            ctx.addIssue({
              code: 'custom',
              path: [
                'parts', partIndex,
                'sections', sectionIndex,
                'links', linkIndex, 'ref',
              ],
              message:
                `Section ${section.code} references lecture ${link.ref}, ` +
                'which is not defined in this book’s `lectures` registry.',
            });
          }

          if (
            link.kind === 'problems' &&
            !link.url &&
            !book.defaults.problemsUrl
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [
                'parts', partIndex,
                'sections', sectionIndex,
                'links', linkIndex,
              ],
              message:
                `Section ${section.code} has a \`problems\` link with no URL ` +
                'and no `defaults.problemsUrl` to fall back to.',
            });
          }
        });
      });
    });
  });

const books = defineCollection({
  loader: glob({
    pattern: '*/book.yaml',
    base: './src/content/books',
    // Default ids would be "<slug>/book"; use the directory name instead.
    generateId: ({ entry }) => entry.split('/')[0]!,
  }),
  schema: bookSchema,
});

/**
 * Per-section study guides. Optional: a section without a guide still
 * renders its roadmap row, so a book can be published before every guide
 * is written.
 */
const guides = defineCollection({
  loader: glob({
    pattern: '*/guides/*.md',
    base: './src/content/books',
    // "<book-slug>/<guide-stem>", e.g. "linear-algebra.../i-1".
    generateId: ({ entry }) =>
      entry.replace('/guides/', '/').replace(/\.md$/, ''),
  }),
  schema: z.object({
    title: z.string().min(1),
    /** Section code this guide belongs to, e.g. "I.1". */
    section: z.string().min(1),
    summary: z.string().min(1),
    readingMinutes: z.number().int().positive().optional(),
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { books, guides };
