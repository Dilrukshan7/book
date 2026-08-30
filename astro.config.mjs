// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';
import { SITE } from './src/site.config.ts';
import { createOpenRouterStream } from './src/lib/server/ai-generator.ts';

/**
 * Vite plugin that intercepts /api/generate-guide in local development (astro dev),
 * reading secrets from .env so local testing works seamlessly without 404s.
 * @returns {import('vite').Plugin}
 */
function devApiPlugin() {
  return {
    name: 'dev-api-generate-guide',
    configureServer(server) {
      server.middlewares.use('/api/generate-guide', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }

        let bodyRaw = '';
        req.on('data', (chunk) => {
          bodyRaw += chunk;
        });

        req.on('end', async () => {
          try {
            const body = JSON.parse(bodyRaw || '{}');
            const env = loadEnv('development', process.cwd(), '');
            const apiKey =
              env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
            const model =
              env.OPENROUTER_MODEL ||
              process.env.OPENROUTER_MODEL ||
              'google/gemini-2.0-flash-001';
            const siteUrl =
              env.SITE_URL || process.env.SITE_URL || 'http://localhost:4321';

            const streamRes = await createOpenRouterStream(
              body.query ?? '',
              apiKey,
              model,
              siteUrl,
            );

            res.statusCode = streamRes.status;
            streamRes.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });

            if (!streamRes.body) {
              const text = await streamRes.text();
              res.end(text);
              return;
            }

            const reader = streamRes.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  err instanceof Error
                    ? err.message
                    : 'Internal dev server error.',
              }),
            );
          }
        });
      });
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.endsWith('/404') &&
        !page.endsWith('/404/') &&
        !page.includes('/roadmap/viewer'),
    }),
  ],

  vite: {
    plugins: [devApiPlugin()],
  },

  /**
   * Self-hosted via Astro's font pipeline: no third-party request at runtime,
   * and Astro generates fallback metrics so swapping in the real face causes
   * no layout shift.
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
