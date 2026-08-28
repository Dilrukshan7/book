/**
 * Guards against a specific Astro footgun.
 *
 * Astro trims trailing whitespace when a tag begins a new source line, so
 *
 *     See the
 *     <a href="/copyright">copyright notice</a>
 *
 * renders as "See thecopyright notice". It is invisible in review, produces
 * no warning, and only shows up when someone reads the page.
 *
 * This scans the built HTML for text welded to an inline tag. Elements that
 * are separated by CSS instead of whitespace (flex `gap`, or a margin) are
 * excluded by class, since those are correct by design.
 *
 * Usage: node scripts/check-spacing.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

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

const INLINE = '(?:a|span|code|strong|em|b|i|abbr)';

/**
 * Spans that are deliberately adjacent because CSS provides the separation.
 * Add a class here ONLY when the spacing genuinely comes from CSS, and say
 * which mechanism, so the list cannot quietly become a way of silencing
 * real bugs.
 *
 *   u-sr ............... visually hidden, never rendered
 *   notice__title ...... display: block
 *   guide__code ........ margin-right
 *   guide__pagercode ... margin-right
 *   resume__code ....... margin-right
 *   row__code .......... its own grid column
 *   specimen__code ..... its own grid column
 *   railnav__roman ..... its own grid column
 *   part__roman ........ its own grid column
 */
const SAFE_TAG = new RegExp(
  'class="(?:' +
    [
      'u-sr',
      'notice__title',
      'guide__code',
      'guide__pagercode',
      'resume__code',
      'row__code',
      'specimen__code',
      'railnav__roman',
      'part__roman',
    ].join('|') +
    ')"|aria-hidden="true"',
);

const openRe = new RegExp(`([^\\s>]{1,2})<(${INLINE})((?:\\s[^>]*)?)>`, 'g');
const closeRe = new RegExp(`</(${INLINE})>([A-Za-z\\u00C0-\\u024F]{2,})`, 'g');

/** The opening tag matching a closing tag at `at`, so its class can be read. */
function openingTagFor(html, at, tag) {
  const before = html.slice(Math.max(0, at - 400), at);
  const openIdx = before.lastIndexOf(`<${tag}`);
  if (openIdx === -1) return '';
  const end = before.indexOf('>', openIdx);
  return end === -1 ? before.slice(openIdx) : before.slice(openIdx, end + 1);
}

let problems = 0;

for (const file of walk(DIST)) {
  const html = readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');
  const found = new Set();

  for (const m of html.matchAll(openRe)) {
    const before = m[1];
    const attrs = m[3] ?? '';
    // Tag directly after another tag, or after punctuation where no space
    // belongs (quotes, brackets, dashes, slashes).
    if (/[>"'(\[‘“–—/-]$/.test(before)) continue;
    if (SAFE_TAG.test(attrs)) continue;
    const at = m.index ?? 0;
    found.add(html.slice(Math.max(0, at - 60), at + m[0].length + 25));
  }

  for (const m of html.matchAll(closeRe)) {
    const at = m.index ?? 0;
    // Text may butt against the closing tag of a CSS-separated element.
    if (SAFE_TAG.test(openingTagFor(html, at, m[1]))) continue;
    found.add(html.slice(Math.max(0, at - 60), at + m[0].length + 10));
  }

  if (found.size > 0) {
    problems += found.size;
    console.log(`\n${rel}`);
    for (const f of found) console.log('   …' + f.replace(/\s+/g, ' ') + '…');
  }
}

if (problems === 0) {
  console.log('check-spacing: no text welded to an inline tag.');
} else {
  console.log(
    `\ncheck-spacing: ${problems} suspicious spot(s).\n` +
      "Insert an explicit {' '} at the end of the preceding line.",
  );
  process.exit(1);
}
