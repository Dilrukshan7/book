/**
 * Single source of truth for site-wide branding and metadata.
 *
 * Renaming the product is a one-line change here, nothing else in the
 * codebase hardcodes the name, tagline, or URL.
 */
export const SITE = {
  /** Product name, shown in the header, <title>, and structured data. */
  name: 'ReadBooks',

  /** Short tagline for the landing hero and meta description fallback. */
  tagline: 'the free material for hard books, in order',

  description:
    'Ordered reading roadmaps for hard technical books. Every section links ' +
    'to the lectures, chapters, and problem sets the authors and ' +
    'universities publish free. No paywalls, no accounts, no tracking.',

  /**
   * Canonical origin. Used for sitemap, canonical tags, and Open Graph URLs.
   */
  url: 'https://books.blansyn.com',

  /** Contact address for copyright / takedown enquiries. */
  contactEmail: 'dilrukshanofficial@gmail.com',

  /** Repository URL, surfaced in the footer and contribution docs. */
  repo: 'https://github.com/Dilrukshan7/book',

  /** Default social preview locale. */
  locale: 'en',
} as const;

/** Primary navigation, rendered in the site header. */
export const NAV = [
  { label: 'Books', href: '/books' },
  { label: 'About', href: '/about' },
  { label: 'Copyright', href: '/copyright' },
] as const;

/**
 * Storage key namespace. Bumping the version invalidates all persisted
 * client state, so only change it alongside a migration in `lib/storage.ts`.
 */
export const STORAGE_NAMESPACE = 'readbooks:v1';
