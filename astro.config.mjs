// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/site.config.ts';

// https://astro.build/config
export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [sitemap()],

  /**
   * Self-hosted via Astro's font pipeline: no third-party request at runtime,
   * and Astro generates fallback metrics so swapping in the real face causes
   * no layout shift.
   *
   * Literata carries the reading: it was cut for long-form book text, which
   * is exactly what this site is about. IBM Plex Sans handles interface and
   * metadata, and Plex Mono sets the section numbering, where tabular figures
   * keep a 46-row index in vertical alignment.
   */
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Literata',
      cssVariable: '--font-serif',
      weights: ['400', '500', '600'],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'Cambria', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'IBM Plex Sans',
      cssVariable: '--font-sans',
      weights: ['400', '500', '600'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'IBM Plex Mono',
      cssVariable: '--font-mono',
      weights: ['400', '500'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'SFMono-Regular', 'monospace'],
    },
  ],

  markdown: {
    /**
     * The fenced blocks in the study guides are display equations, not code.
     * Shiki was wrapping them in its own dark theme via inline styles, which
     * beat the stylesheet on specificity and produced 1.24:1 contrast. With
     * highlighting off they are plain `pre > code`, and the typography here
     * governs them.
     *
     * If a guide ever needs real syntax-highlighted code, turn this back on
     * with a light `shikiConfig.theme` rather than removing this comment.
     */
    syntaxHighlight: false,
  },

  build: {
    // Emit `about/index.html` rather than `about.html` so URLs are clean
    // on any static host without server-side rewrite rules.
    format: 'directory',
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
