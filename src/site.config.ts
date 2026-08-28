/**
 * Single source of truth for site-wide branding and metadata.
 *
 * Renaming the product is a one-line change here — nothing else in the
 * codebase hardcodes the name, tagline, or URL.
 */
export const SITE = {
  /** Product name, shown in the header, <title>, and structured data. */
  name: 'ReadBooks',

  /** Short tagline for the landing hero and meta description fallback. */
  tagline: 'Read hard books for free, in the right order.',

  description:
    'Free, step-by-step reading roadmaps for great technical books. ' +
    'Every step links straight to the material the authors and universities ' +
    'publish for free — no paywalls, no accounts, no tracking.',

  /**
   * Canonical origin. Used for sitemap, canonical tags, and Open Graph URLs.
   * Update this once a custom domain is attached.
   */
  url: 'https://readbooks.pages.dev',

  /** Contact address for copyright / takedown enquiries. */
  contactEmail: 'dilrukshanofficial@gmail.com',

  /** Repository URL, surfaced in the footer and contribution docs. */
  repo: 'https://github.com/dilrukshan/readbooks',

  /** Default social preview locale. */
  locale: 'en',
} as const;

/** Primary navigation, rendered in the site header. */
export const NAV = [
  { label: 'Books', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Copyright', href: '/copyright' },
] as const;

/**
 * Storage key namespace. Bumping the version invalidates all persisted
 * client state, so only change it alongside a migration in `lib/storage.ts`.
 */
export const STORAGE_NAMESPACE = 'readbooks:v1';
