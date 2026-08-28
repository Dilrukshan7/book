/**
 * Verifies every outbound link in the built site still resolves.
 *
 * The whole premise of this site is linking to material on other people's
 * servers, so a link rotting is a real failure — and a silent one. This runs
 * in CI on a schedule to catch it.
 *
 * Usage:
 *   node scripts/check-links.mjs            # external links only
 *   node scripts/check-links.mjs --internal # also verify internal routes
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const CONCURRENCY = 6;
const TIMEOUT_MS = 30_000;
const RETRIES = 2;
const UA =
  'Mozilla/5.0 (compatible; ReadBooksLinkCheck/1.0; +https://readbooks.pages.dev)';

const checkInternal = process.argv.includes('--internal');

if (!existsSync(DIST)) {
  console.error(`No ${DIST}/ directory. Run \`npm run build\` first.`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

/**
 * The site's own canonical origin, taken from site.config.ts.
 *
 * Canonical and Open Graph tags point at the deployed origin, which is not
 * reachable while building locally and would otherwise dominate the report.
 * Internal routes are verified from the file system instead, via --internal.
 */
const selfOrigin = (() => {
  const config = readFileSync('src/site.config.ts', 'utf8');
  const m = config.match(/url:\s*'([^']+)'/);
  return m ? m[1].replace(/\/$/, '') : null;
})();

/** url -> the pages that link to it */
const links = new Map();
const internal = new Set();
const pages = walk(DIST);

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/').replace(/^dist/, '');
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (selfOrigin && href.startsWith(selfOrigin)) continue;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      if (!links.has(href)) links.set(href, new Set());
      links.get(href).add(rel);
    } else if (href.startsWith('/') && !href.startsWith('//')) {
      internal.add(href.split('#')[0]);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Internal routes: confirm each one was actually emitted.
 * ------------------------------------------------------------------ */
const internalFailures = [];
if (checkInternal) {
  for (const route of internal) {
    if (route.startsWith('/sitemap')) continue;
    const candidates = [
      join(DIST, route),
      join(DIST, route, 'index.html'),
      join(DIST, `${route}.html`),
    ];
    if (!candidates.some((p) => existsSync(p))) {
      internalFailures.push(route);
    }
  }
}

/* ------------------------------------------------------------------ *
 * External links
 * ------------------------------------------------------------------ */
async function probe(url) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    // Some servers reject HEAD outright; fall back to a ranged GET.
    for (const method of ['HEAD', 'GET']) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method,
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': UA,
            ...(method === 'GET' ? { range: 'bytes=0-2048' } : {}),
          },
        });
        clearTimeout(timer);
        if (res.ok || res.status === 206) return { ok: true, status: res.status };
        // Method not allowed / forbidden for HEAD — try GET.
        if (method === 'HEAD' && [403, 405, 501].includes(res.status)) continue;
        if (res.status < 500) return { ok: false, status: res.status };
      } catch (err) {
        clearTimeout(timer);
        if (method === 'GET' && attempt === RETRIES) {
          return { ok: false, status: 0, error: String(err?.message ?? err) };
        }
      }
    }
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return { ok: false, status: 0, error: 'exhausted retries' };
}

const urls = [...links.keys()].sort();
const failures = [];
let done = 0;

async function worker(queue) {
  for (;;) {
    const url = queue.pop();
    if (!url) return;
    const result = await probe(url);
    done++;
    const tag = result.ok ? 'ok  ' : 'FAIL';
    process.stdout.write(
      `[${String(done).padStart(3)}/${urls.length}] ${tag} ${result.status || '---'}  ${url}\n`,
    );
    if (!result.ok) failures.push({ url, ...result, pages: [...links.get(url)] });
  }
}

const queue = [...urls];
console.log(
  `Checking ${urls.length} external link(s) across ${pages.length} page(s)…\n`,
);
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)),
);

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */
console.log('');
if (internalFailures.length) {
  console.log(`Internal routes with no emitted file (${internalFailures.length}):`);
  for (const r of internalFailures) console.log(`  ${r}`);
  console.log('');
}

if (failures.length === 0 && internalFailures.length === 0) {
  console.log(`check-links: all ${urls.length} external links resolve.`);
  process.exit(0);
}

if (failures.length) {
  console.log(`Broken external links (${failures.length}):`);
  for (const f of failures) {
    console.log(`\n  ${f.url}`);
    console.log(`    status: ${f.status || 'network error'}${f.error ? ` (${f.error})` : ''}`);
    console.log(`    linked from: ${f.pages.join(', ')}`);
  }
}
process.exit(1);
