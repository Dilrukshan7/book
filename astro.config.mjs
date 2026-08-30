// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/site.config.ts';

// https://astro.build/config
export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith('/404') && !page.endsWith('/404/'),
    }),
  ],

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
    syntaxHighlight: false,
  },

  build: {
    format: 'directory',
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
